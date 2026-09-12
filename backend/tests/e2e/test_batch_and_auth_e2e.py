"""
End-to-end coverage for the two features added on top of the reference
tutorial project: API key auth and the streaming batch CSV endpoint.
"""
import io

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client_with_auth(monkeypatch, _test_db_url, trained_ml_classifier, mock_llm_classifier):
    """Same as the `client` fixture in test_api_e2e.py but with an API key required."""
    monkeypatch.setattr("app.core.config.settings.api_keys", "test-key-123")

    from app.api import deps
    from app.db.session import Base, engine
    from app.main import app
    from app.services.classification_service import ClassificationService
    from app.services.regex_classifier import RegexClassifier

    Base.metadata.create_all(bind=engine)

    def _override_service():
        return ClassificationService(
            regex_classifier=RegexClassifier(),
            ml_classifier=trained_ml_classifier,
            llm_classifier=mock_llm_classifier,
            candidate_labels=["security_alert", "resource_usage", "workflow_error", "unclassified"],
            ml_confidence_threshold=0.75,
            llm_fallback_confidence_threshold=0.6,
        )

    app.dependency_overrides[deps.get_classification_service] = _override_service

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_classify_without_api_key_is_rejected(client_with_auth):
    response = client_with_auth.post(
        "/api/v1/classify", json={"text": "Multiple login failures on user 9052"}
    )
    assert response.status_code == 401


def test_classify_with_wrong_api_key_is_rejected(client_with_auth):
    response = client_with_auth.post(
        "/api/v1/classify",
        json={"text": "Multiple login failures on user 9052"},
        headers={"X-API-Key": "wrong-key"},
    )
    assert response.status_code == 401


def test_classify_with_correct_api_key_succeeds(client_with_auth):
    response = client_with_auth.post(
        "/api/v1/classify",
        json={"text": "Multiple login failures on user 9052"},
        headers={"X-API-Key": "test-key-123"},
    )
    assert response.status_code == 200
    assert response.json()["label"] == "security_alert"


def test_health_endpoint_does_not_require_api_key(client_with_auth):
    # Health checks must always be reachable by orchestrators without a key.
    response = client_with_auth.get("/api/v1/health")
    assert response.status_code == 200


def test_batch_classify_returns_csv_with_predictions(client):
    csv_content = (
        "log_message,source\n"
        '"Multiple login failures occurred on user 9052 account",AuthService\n'
        '"disk io saturation detected on volume data-02",Monitoring\n'
    )
    files = {"file": ("logs.csv", io.BytesIO(csv_content.encode()), "text/csv")}

    response = client.post("/api/v1/classify/batch", files=files)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    body = response.text
    assert "predicted_label" in body
    assert "security_alert" in body


def test_batch_classify_rejects_csv_missing_required_column(client):
    csv_content = "not_the_right_column\nsome value\n"
    files = {"file": ("logs.csv", io.BytesIO(csv_content.encode()), "text/csv")}

    response = client.post("/api/v1/classify/batch", files=files)

    assert response.status_code == 400
    assert "log_message" in response.json()["detail"]


def test_batch_classify_rejects_empty_csv(client):
    csv_content = "log_message\n"
    files = {"file": ("logs.csv", io.BytesIO(csv_content.encode()), "text/csv")}

    response = client.post("/api/v1/classify/batch", files=files)

    assert response.status_code == 400


def test_batch_classify_skips_blank_rows_without_erroring(client):
    csv_content = 'log_message\n"Multiple login failures occurred on user 9052 account"\n""\n'
    files = {"file": ("logs.csv", io.BytesIO(csv_content.encode()), "text/csv")}

    response = client.post("/api/v1/classify/batch", files=files)

    assert response.status_code == 200
    assert "skipped_empty" in response.text


def test_two_concurrent_batch_uploads_do_not_corrupt_each_others_output(client):
    """
    Regression test for the shared-file bug in the reference tutorial:
    every batch response must contain only its own rows, never another
    request's rows, even when requests overlap.
    """
    csv_a = 'log_message\n"Multiple login failures occurred on user 9052 account"\n'
    csv_b = 'log_message\n"Escalation rule execution failed for ticket ID 9807"\n'

    response_a = client.post(
        "/api/v1/classify/batch",
        files={"file": ("a.csv", io.BytesIO(csv_a.encode()), "text/csv")},
    )
    response_b = client.post(
        "/api/v1/classify/batch",
        files={"file": ("b.csv", io.BytesIO(csv_b.encode()), "text/csv")},
    )

    assert "security_alert" in response_a.text
    assert "workflow_error" not in response_a.text
    assert "workflow_error" in response_b.text
    assert "security_alert" not in response_b.text
