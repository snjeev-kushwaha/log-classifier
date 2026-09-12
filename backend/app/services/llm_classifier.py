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
        model: str = "deepseek-r1-distill-llama-70b",
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
        user_prompt = f"Categories: {', '.join(candidate_labels)}\n\nLog line:\n{text}"

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
        # Strip accidental markdown code fences before parsing.
        cleaned = raw.replace("```json", "").replace("```", "").strip()
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise LLMClassificationError(f"Could not parse LLM response as JSON: {raw!r}") from exc
        if "label" not in data or "confidence" not in data:
            raise LLMClassificationError(f"LLM response missing required fields: {data!r}")
        return data
