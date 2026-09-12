import json
from unittest.mock import MagicMock

import pytest

from app.services.llm_classifier import LLMClassificationError, LLMClassifier


def _make_mock_groq_response(payload: dict):
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content=json.dumps(payload)))]
    return mock_response


def test_classify_parses_valid_json_response():
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _make_mock_groq_response(
        {"label": "workflow_error", "confidence": 0.9, "reasoning": "matches escalation failure"}
    )
    clf = LLMClassifier(api_key="fake-key", client=fake_client)

    label, confidence, reasoning = clf.classify(
        "Escalation rule execution failed for ticket 42", ["workflow_error", "security_alert"]
    )

    assert label == "workflow_error"
    assert confidence == 0.9
    assert "escalation" in reasoning.lower()


def test_classify_strips_markdown_fences():
    fake_client = MagicMock()
    fenced = "```json\n" + json.dumps({"label": "security_alert", "confidence": 0.7}) + "\n```"
    fake_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content=fenced))]
    )
    clf = LLMClassifier(api_key="fake-key", client=fake_client)

    label, confidence, _ = clf.classify("suspicious login pattern", ["security_alert"])
    assert label == "security_alert"
    assert confidence == 0.7


def test_classify_raises_after_exhausting_retries():
    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = TimeoutError("timeout")
    clf = LLMClassifier(api_key="fake-key", client=fake_client, max_retries=1)

    with pytest.raises(LLMClassificationError):
        clf.classify("some rare log pattern", ["unknown"])

    # initial attempt + 1 retry = 2 calls
    assert fake_client.chat.completions.create.call_count == 2


def test_classify_does_not_retry_non_transient_errors():
    """A non-retryable error (e.g. a malformed request) should fail fast, not retry."""
    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = ValueError("bad request payload")
    clf = LLMClassifier(api_key="fake-key", client=fake_client, max_retries=3)

    with pytest.raises(LLMClassificationError):
        clf.classify("some log line", ["unknown"])

    assert fake_client.chat.completions.create.call_count == 1


def test_classify_raises_on_malformed_json():
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="not valid json at all"))]
    )
    clf = LLMClassifier(api_key="fake-key", client=fake_client, max_retries=0)

    with pytest.raises(LLMClassificationError):
        clf.classify("some log line", ["unknown"])
