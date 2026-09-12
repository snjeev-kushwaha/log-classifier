"""
Integration tests for the routing logic itself: regex -> ML -> LLM ->
human review, verifying each layer hands off to the next correctly.
"""
from app.services.classification_service import ClassificationService
from app.services.regex_classifier import RegexClassifier
from unittest.mock import MagicMock


def test_regex_match_short_circuits_ml_and_llm(classification_service):
    classification_service.ml_classifier.classify = MagicMock(
        side_effect=AssertionError("ML should not be called when regex matches")
    )
    classification_service.llm_classifier.classify = MagicMock(
        side_effect=AssertionError("LLM should not be called when regex matches")
    )

    result = classification_service.classify("Multiple login failures occurred on user 9052 account")

    assert result.method_used == "regex"
    assert result.label == "security_alert"
    assert result.confidence == 1.0
    assert result.needs_human_review is False


def test_high_confidence_ml_result_skips_llm(classification_service):
    classification_service.llm_classifier.classify = MagicMock(
        side_effect=AssertionError("LLM should not be called when ML confidence is high enough")
    )

    # Exact training example: with the TF-IDF fallback embedder (used when
    # sentence-transformers isn't installed) confidence is highest on text
    # the vectorizer was fit on, so this is deterministic in any environment.
    result = classification_service.classify("disk io saturation detected on volume data-02")

    assert result.method_used == "ml"
    assert result.confidence >= classification_service.ml_confidence_threshold


def test_low_confidence_ml_escalates_to_llm(classification_service, mock_llm_classifier):
    # Force ML to report low confidence regardless of input.
    classification_service.ml_classifier.classify = MagicMock(return_value=("resource_usage", 0.3))

    result = classification_service.classify("some ambiguous log line with no clear pattern")

    assert result.method_used == "llm"
    assert result.label == "workflow_error"  # from mock_llm_classifier fixture
    mock_llm_classifier.classify.assert_called_once()


def test_llm_low_confidence_flags_human_review(classification_service, mock_llm_classifier):
    classification_service.ml_classifier.classify = MagicMock(return_value=("resource_usage", 0.3))
    mock_llm_classifier.classify.return_value = ("unclassified", 0.4, "highly ambiguous input")

    result = classification_service.classify("totally novel and confusing log format")

    assert result.method_used == "llm"
    assert result.needs_human_review is True


def test_no_ml_or_llm_available_routes_to_human_review():
    service = ClassificationService(
        regex_classifier=RegexClassifier(),
        ml_classifier=None,
        llm_classifier=None,
        candidate_labels=["unclassified"],
    )

    result = service.classify("log line matching nothing at all")

    assert result.method_used == "human_review"
    assert result.needs_human_review is True
    assert result.label == "unclassified"


def test_llm_failure_falls_back_to_human_review(classification_service, mock_llm_classifier):
    from app.services.llm_classifier import LLMClassificationError

    classification_service.ml_classifier.classify = MagicMock(return_value=("resource_usage", 0.3))
    mock_llm_classifier.classify.side_effect = LLMClassificationError("groq unavailable")

    result = classification_service.classify("log line the LLM chokes on")

    assert result.method_used == "human_review"
    assert result.needs_human_review is True


def test_known_low_quality_source_bypasses_regex_and_ml(classification_service, mock_llm_classifier):
    """
    A source configured in llm_only_sources should go straight to the LLM,
    even when the text would otherwise match a regex rule - we've decided
    ahead of time that this source's patterns aren't trustworthy for
    regex/ML (e.g. a legacy system with inconsistent formatting).
    """
    classification_service.llm_only_sources = {"LegacyCRM"}
    classification_service.regex_classifier.classify = MagicMock(
        side_effect=AssertionError("regex should not run for an LLM-only source")
    )
    classification_service.ml_classifier.classify = MagicMock(
        side_effect=AssertionError("ML should not run for an LLM-only source")
    )

    result = classification_service.classify(
        "Multiple login failures occurred on user 9052 account",  # would match regex
        source="LegacyCRM",
    )

    assert result.method_used == "llm"
    mock_llm_classifier.classify.assert_called_once()


def test_source_not_in_override_list_uses_normal_routing(classification_service):
    """Only configured sources get the bypass - everything else routes normally."""
    classification_service.llm_only_sources = {"LegacyCRM"}

    result = classification_service.classify(
        "Multiple login failures occurred on user 9052 account",
        source="ModernAuthService",
    )

    assert result.method_used == "regex"
