"""
Orchestrator for the hybrid classification pipeline.

Routing logic:
  0. Source override - some upstream systems are known ahead of time to
     produce text no classifier has enough clean training data for (e.g. a
     legacy system being decommissioned, or a brand-new integration). For
     those, skip straight to the LLM rather than wasting a doomed regex/ML
     pass. This mirrors a real-world pattern: route on what you already
     know about the data source, not only on live confidence scores.
  1. Regex - try first. If a rule matches, return immediately (cheapest, fastest).
  2. Confidence router - decide ML vs LLM based on whether the ML classifier
     has been trained (i.e. enough labeled data exists for known classes).
  3. ML - if trained, classify and check confidence against threshold.
     If confidence is high enough, return. Otherwise fall through to LLM.
  4. LLM - last resort for rare/complex patterns, low ML confidence, or a
     source override.
  5. If even the LLM's confidence is below the review threshold, flag the
     result for human review rather than trusting it blindly.
"""
from __future__ import annotations

import logging
from typing import Optional

from app.models.schemas import (
    ClassificationMethod,
    ClassificationResult,
    MultiLogClassifyResponse,
    MultiLogItemResult,
)
from app.services.llm_classifier import LLMClassificationError, LLMClassifier
from app.services.ml_classifier import MLClassifier
from app.services.regex_classifier import RegexClassifier

logger = logging.getLogger(__name__)


class ClassificationService:
    def __init__(
        self,
        regex_classifier: RegexClassifier,
        ml_classifier: Optional[MLClassifier],
        llm_classifier: Optional[LLMClassifier],
        candidate_labels: list[str],
        ml_confidence_threshold: float = 0.75,
        llm_fallback_confidence_threshold: float = 0.6,
        llm_only_sources: Optional[set[str]] = None,
    ):
        self.regex_classifier = regex_classifier
        self.ml_classifier = ml_classifier
        self.llm_classifier = llm_classifier
        self.candidate_labels = candidate_labels
        self.ml_confidence_threshold = ml_confidence_threshold
        self.llm_fallback_confidence_threshold = llm_fallback_confidence_threshold
        # Sources known ahead of time to lack usable regex/ML coverage -
        # e.g. a legacy system's logs are too inconsistent to have been
        # part of the regex rule set or the ML training data. Configured
        # via settings.llm_only_sources (comma-separated env var).
        self.llm_only_sources = llm_only_sources or set()

    def classify(self, text: str, source: Optional[str] = None) -> ClassificationResult:
        # --- Layer 0: known-source override ---
        if source and source in self.llm_only_sources:
            return self._classify_with_llm(text, forced=True)

        # --- Layer 1: regex ---
        regex_label = self.regex_classifier.classify(text)
        if regex_label is not None:
            return ClassificationResult(
                text=text,
                label=regex_label,
                confidence=1.0,
                method_used=ClassificationMethod.REGEX,
                needs_human_review=False,
            )

        # --- Layer 2: ML (BERT + LogisticRegression) ---
        if self.ml_classifier is not None and self.ml_classifier.classifier is not None:
            ml_label, ml_confidence = self.ml_classifier.classify(text)
            if ml_confidence >= self.ml_confidence_threshold:
                return ClassificationResult(
                    text=text,
                    label=ml_label,
                    confidence=ml_confidence,
                    method_used=ClassificationMethod.ML,
                    needs_human_review=False,
                )
            logger.info("ML confidence %.2f below threshold, escalating to LLM", ml_confidence)

        # --- Layer 3: LLM (Groq) ---
        return self._classify_with_llm(text)

    def _classify_with_llm(self, text: str, forced: bool = False) -> ClassificationResult:
        if self.llm_classifier is not None:
            try:
                llm_label, llm_confidence, reasoning = self.llm_classifier.classify(
                    text, self.candidate_labels
                )
                needs_review = llm_confidence < self.llm_fallback_confidence_threshold
                return ClassificationResult(
                    text=text,
                    label=llm_label,
                    confidence=llm_confidence,
                    method_used=ClassificationMethod.LLM,
                    needs_human_review=needs_review,
                    reasoning=reasoning,
                )
            except LLMClassificationError as exc:
                logger.error("LLM classification failed (forced=%s): %s", forced, exc)

        # --- All layers failed or unavailable: send to human review ---
        return ClassificationResult(
            text=text,
            label="unclassified",
            confidence=0.0,
            method_used=ClassificationMethod.HUMAN_REVIEW,
            needs_human_review=True,
        )

    def classify_multi(
        self,
        text: str,
        source: Optional[str] = None,
        db_rules: Optional[list] = None,
    ) -> MultiLogClassifyResponse:
        import concurrent.futures
        import re

        raw_lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not raw_lines:
            return MultiLogClassifyResponse(
                total_logs=0,
                category_counts={},
                incident_reasoning="No log lines provided for analysis.",
                items=[],
            )

        items_map: dict[int, MultiLogItemResult] = {}
        unresolved_lines: list[tuple[int, str]] = []

        # 1. Layer 1: Fast Regex Matching (dynamic rules + default rules)
        for idx, line in enumerate(raw_lines, start=1):
            matched_label = None
            if db_rules:
                for r in db_rules:
                    try:
                        if re.search(r.pattern, line, re.IGNORECASE):
                            matched_label = r.label
                            break
                    except Exception:
                        pass

            if not matched_label:
                matched_label = self.regex_classifier.classify(line)

            if matched_label:
                if matched_label == "workflow_error":
                    reason = "Database deadlock, constraint violation, transaction timeout, or workflow error pattern identified."
                elif matched_label == "resource_usage":
                    reason = "Memory saturation, disk capacity, OOM, or resource limit pattern identified."
                elif matched_label == "security_alert":
                    reason = "Authentication failure, unauthorized access, or security threat pattern identified."
                else:
                    reason = f"Deterministic pattern match for {matched_label}."

                items_map[idx] = MultiLogItemResult(
                    line_number=idx,
                    text=line,
                    label=matched_label,
                    confidence=1.0,
                    method_used=ClassificationMethod.REGEX,
                    needs_human_review=False,
                    reasoning=reason,
                )
            else:
                unresolved_lines.append((idx, line))

        # 2. Layer 2: ML Model (if loaded)
        still_unresolved: list[tuple[int, str]] = []
        if self.ml_classifier is not None and self.ml_classifier.classifier is not None:
            for idx, line in unresolved_lines:
                try:
                    ml_label, ml_confidence = self.ml_classifier.classify(line)
                    if ml_confidence >= self.ml_confidence_threshold:
                        items_map[idx] = MultiLogItemResult(
                            line_number=idx,
                            text=line,
                            label=ml_label,
                            confidence=ml_confidence,
                            method_used=ClassificationMethod.ML,
                            needs_human_review=False,
                            reasoning=f"Classified by machine learning model ({round(ml_confidence * 100)}% confidence).",
                        )
                    else:
                        still_unresolved.append((idx, line))
                except Exception:
                    still_unresolved.append((idx, line))
        else:
            still_unresolved = unresolved_lines

        # 3. Layer 3: LLM (Groq) Batch Pass for remaining lines
        if still_unresolved and self.llm_classifier is not None:
            chunk_size = 25
            chunks = [
                still_unresolved[i : i + chunk_size]
                for i in range(0, len(still_unresolved), chunk_size)
            ]

            def _process_chunk(chunk):
                return self.llm_classifier.classify_batch(chunk, self.candidate_labels)

            workers = min(2, max(1, len(chunks)))
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                futures = [executor.submit(_process_chunk, c) for c in chunks]
                for f in concurrent.futures.as_completed(futures):
                    try:
                        batch_res = f.result()
                        for lid, (lbl, conf, reason) in batch_res.items():
                            needs_rev = conf < self.llm_fallback_confidence_threshold
                            items_map[lid] = MultiLogItemResult(
                                line_number=lid,
                                text=raw_lines[lid - 1],
                                label=lbl,
                                confidence=conf,
                                method_used=ClassificationMethod.LLM,
                                needs_human_review=needs_rev,
                                reasoning=reason,
                            )
                    except Exception as e:
                        logger.error("Error in LLM chunk execution: %s", e)

        # 4. Fill any remaining unclassified lines
        for idx, line in enumerate(raw_lines, start=1):
            if idx not in items_map:
                items_map[idx] = MultiLogItemResult(
                    line_number=idx,
                    text=line,
                    label="unclassified",
                    confidence=0.0,
                    method_used=ClassificationMethod.HUMAN_REVIEW,
                    needs_human_review=True,
                    reasoning="Unmatched across rules and models; flagged for manual review.",
                )

        sorted_items = [items_map[i] for i in range(1, len(raw_lines) + 1)]

        # 5. Compute Category Distribution
        counts: dict[str, int] = {}
        for it in sorted_items:
            counts[it.label] = counts.get(it.label, 0) + 1

        # 6. Generate Overall Incident Reasoning
        sample_error_lines = [it.text for it in sorted_items if it.label != "unclassified"]
        incident_reasoning = ""
        if self.llm_classifier is not None:
            try:
                res = self.llm_classifier.generate_incident_reasoning(
                    len(sorted_items), counts, sample_error_lines[:15]
                )
                if isinstance(res, str) and res.strip():
                    incident_reasoning = res.strip()
            except Exception as e:
                logger.error("Failed to generate incident diagnosis: %s", e)

        if not incident_reasoning:
            categories_summary = ", ".join(f"{k}: {v}" for k, v in counts.items())
            incident_reasoning = (
                f"Incident triage detected {len(sorted_items)} log events across categories: {categories_summary}. "
                "Consult the classified event log below for detailed failure traces."
            )

        return MultiLogClassifyResponse(
            total_logs=len(sorted_items),
            category_counts=counts,
            incident_reasoning=incident_reasoning,
            items=sorted_items,
        )

