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

from app.models.schemas import ClassificationMethod, ClassificationResult
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
