"""
Layer 3 of the hybrid pipeline: LLM classification via Groq.

Reserved for logs that are too rare or too structurally complex for the
regex and ML layers to handle confidently. This is the slowest and most
expensive path, so it should see the smallest share of production traffic.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from groq import APIConnectionError, APIStatusError, Groq
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a log classification engine. Classify the given \
application log line into exactly one of the provided categories. \
Respond with ONLY a JSON object: {"label": "<category>", "confidence": <0-1 float>, \
"reasoning": "<one short sentence>"}. No markdown, no extra text."""

# Retry on network/connection errors and 5xx/429 responses - these are
# transient. Never retry on 4xx client errors (bad request, auth failure)
# since retrying an invalid request just wastes time and quota.
_RETRYABLE_EXCEPTIONS = (APIConnectionError, APIStatusError, TimeoutError)


class LLMClassificationError(Exception):
    pass


class LLMClassifier:
    def __init__(
        self,
        api_key: str,
        model: str = "qwen/qwen3.8-27b",
        timeout_seconds: float = 8.0,
        max_retries: int = 2,
        client: Optional[Groq] = None,
    ):
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.client = client or Groq(api_key=api_key, timeout=timeout_seconds)

    def classify(self, text: str, candidate_labels: list[str]) -> tuple[str, float, str]:
        """Returns (label, confidence, reasoning). Raises LLMClassificationError on failure."""
        clipped_text = text[:4000] if len(text) > 4000 else text
        user_prompt = f"Categories: {', '.join(candidate_labels)}\n\nLog line:\n{clipped_text}"

        @retry(
            reraise=True,
            stop=stop_after_attempt(self.max_retries + 1),
            wait=wait_exponential_jitter(initial=0.5, max=8),
            retry=retry_if_exception_type(_RETRYABLE_EXCEPTIONS),
            before_sleep=lambda retry_state: logger.warning(
                "LLM call failed (attempt %s), retrying: %s",
                retry_state.attempt_number,
                retry_state.outcome.exception(),
            ),
        )
        def _call():
            return self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.0,
                max_tokens=200,
            )

        try:
            response = _call()
        except Exception as exc:  # noqa: BLE001 - normalize all failures to our error type
            raise LLMClassificationError(f"LLM classification failed after retries: {exc}") from exc

        raw = response.choices[0].message.content.strip()
        parsed = self._parse_response(raw)
        return parsed["label"], float(parsed["confidence"]), parsed.get("reasoning", "")

    @staticmethod
    def _parse_response(raw: str) -> dict:
        # Strip accidental markdown code fences and reasoning tags before parsing.
        cleaned = raw.replace("```json", "").replace("```", "").strip()
        if "<think>" in cleaned and "</think>" in cleaned:
            cleaned = cleaned.split("</think>")[-1].strip()
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            import re
            match = re.search(r"\{.*?\}", cleaned, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group(0))
                except Exception:
                    raise LLMClassificationError(f"Could not parse LLM response as JSON: {raw!r}") from exc
            else:
                raise LLMClassificationError(f"Could not parse LLM response as JSON: {raw!r}") from exc
        if "label" not in data or "confidence" not in data:
            raise LLMClassificationError(f"LLM response missing required fields: {data!r}")
        return data

    def classify_batch(
        self,
        indexed_lines: list[tuple[int, str]],
        candidate_labels: list[str],
    ) -> dict[int, tuple[str, float, str]]:
        """
        Classifies a list of (line_id, text) pairs in a single LLM invocation.
        Returns a dict mapping line_id -> (label, confidence, reasoning).
        """
        if not indexed_lines:
            return {}

        formatted_logs = "\n".join(
            f"{lid}: {text[:300]}" for lid, text in indexed_lines
        )
        prompt = (
            f"You are an expert system log classification engine.\n"
            f"Categories: {', '.join(candidate_labels)}\n\n"
            f"For each numbered log line, determine its category, confidence score (0.0 to 1.0), and a concise reasoning explaining the error.\n"
            f"Return ONLY a JSON array of objects with keys: id (integer), label (string from categories), confidence (float), reasoning (string).\n\n"
            f"Logs:\n{formatted_logs}"
        )

        @retry(
            reraise=True,
            stop=stop_after_attempt(2),
            wait=wait_exponential_jitter(initial=0.2, max=2),
            retry=retry_if_exception_type(_RETRYABLE_EXCEPTIONS),
            before_sleep=lambda retry_state: logger.warning(
                "LLM batch call failed (attempt %s), retrying: %s",
                retry_state.attempt_number,
                retry_state.outcome.exception(),
            ),
        )
        def _call():
            return self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a JSON-only API. Respond strictly with a JSON array of objects without markdown formatting or code blocks."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
                max_tokens=min(400, max(120, len(indexed_lines) * 28)),
            )

        try:
            response = _call()
        except Exception as exc:
            logger.error("LLM batch classification failed: %s", exc)
            return {}

        raw = response.choices[0].message.content.strip()
        cleaned = raw.replace("```json", "").replace("```", "").strip()
        if "<think>" in cleaned and "</think>" in cleaned:
            cleaned = cleaned.split("</think>")[-1].strip()

        try:
            items = json.loads(cleaned)
        except Exception:
            import re
            match = re.search(r"\[.*?\]", cleaned, re.DOTALL)
            if match:
                try:
                    items = json.loads(match.group(0))
                except Exception:
                    return {}
            else:
                return {}

        results: dict[int, tuple[str, float, str]] = {}
        if isinstance(items, list):
            for item in items:
                try:
                    lid = int(item["id"])
                    lbl = str(item["label"])
                    conf = float(item["confidence"])
                    reason = str(item.get("reasoning", ""))
                    results[lid] = (lbl, conf, reason)
                except Exception:
                    continue
        return results

    def generate_incident_reasoning(
        self,
        total_logs: int,
        category_counts: dict[str, int],
        key_samples: list[str],
    ) -> str:
        """Generates executive root cause diagnosis across a multi-log incident."""
        prompt = (
            "You are a senior Site Reliability Engineer diagnosing a multi-log incident.\n"
            f"Total log events analyzed: {total_logs}\n"
            f"Category counts: {json.dumps(category_counts)}\n"
            "Key log excerpts from the incident:\n"
            + "\n".join(f"- {s[:250]}" for s in key_samples[:10])
            + "\n\nProvide an executive 2-3 sentence Root Cause Incident Diagnosis explaining the exact errors occurring in the system and their correlation. Do not use markdown formatting, bullets, or headers; respond with clear, authoritative text."
        )

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=250,
            )
            raw = response.choices[0].message.content.strip()
            if "<think>" in raw and "</think>" in raw:
                raw = raw.split("</think>")[-1].strip()
            return raw
        except Exception as exc:
            logger.error("Failed to generate incident reasoning: %s", exc)
            active_cats = [f"{k} ({v})" for k, v in category_counts.items() if v > 0]
            return f"Analyzed {total_logs} log entries. Detected errors across {', '.join(active_cats)}. Review specific log line classifications below for details."
