"""
Shared fixtures for the backend test suite.
"""
import pytest
from unittest.mock import MagicMock

from app.services.classification_service import ClassificationService
from app.services.ml_classifier import MLClassifier
from app.services.regex_classifier import RegexClassifier

CANDIDATE_LABELS = ["security_alert", "resource_usage", "workflow_error", "unclassified"]


@pytest.fixture
def regex_classifier():
    return RegexClassifier()


@pytest.fixture
def trained_ml_classifier():
    """A real MLClassifier trained on a tiny synthetic dataset (fast, deterministic)."""
    clf = MLClassifier()
    texts = [
        "cpu utilization spiked to 95 percent on node 12",
        "memory usage climbing steadily on worker pool 3",
        "disk io saturation detected on volume data-02",
        "user session token refreshed successfully for account 771",
        "password reset email dispatched to registered address",
        "profile picture updated for user 4432",
    ]
    labels = [
        "resource_usage", "resource_usage", "resource_usage",
        "account_activity", "account_activity", "account_activity",
    ]
    clf.train(texts, labels)
    return clf


@pytest.fixture
def mock_llm_classifier():
    mock = MagicMock()
    mock.classify.return_value = ("workflow_error", 0.82, "Matches escalation failure pattern")
    return mock


@pytest.fixture
def classification_service(regex_classifier, trained_ml_classifier, mock_llm_classifier):
    return ClassificationService(
        regex_classifier=regex_classifier,
        ml_classifier=trained_ml_classifier,
        llm_classifier=mock_llm_classifier,
        candidate_labels=CANDIDATE_LABELS,
        ml_confidence_threshold=0.75,
        llm_fallback_confidence_threshold=0.6,
    )
