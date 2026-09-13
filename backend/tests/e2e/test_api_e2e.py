"""
End-to-end tests: real HTTP request/response cycle through FastAPI's
TestClient, real SQLite database (isolated per test run via a temp file),
real regex + ML classifiers, and a mocked LLM/Groq boundary (the only
external network dependency - never call the real API in tests).

Shared fixtures (`client`, `_test_db_url`) live in tests/e2e/conftest.py.
"""


def test_health_endpoint_reports_ready(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["ml_model_loaded"] is True
    assert body["regex_rule_count"] > 0


def test_metrics_endpoint_exposes_prometheus_format(client):
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "http_requests_total" in response.text


def test_response_includes_request_id_header(client):
    response = client.get("/api/v1/health")
    assert "x-request-id" in response.headers


def test_classify_regex_path_end_to_end(client):
    response = client.post(
        "/api/v1/classify",
        json={"text": "Multiple login failures occurred on user 9052 account"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["label"] == "security_alert"
    assert body["method_used"] == "regex"
    assert body["confidence"] == 1.0


def test_classify_ml_path_end_to_end(client):
    response = client.post(
        "/api/v1/classify",
        json={"text": "disk io saturation detected on volume data-09"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["method_used"] in {"ml", "llm"}  # depends on trained confidence
    assert 0.0 <= body["confidence"] <= 1.0


def test_classify_empty_text_returns_validation_error(client):
    response = client.post("/api/v1/classify", json={"text": ""})
    assert response.status_code == 422


def test_classify_missing_field_returns_validation_error(client):
    response = client.post("/api/v1/classify", json={})
    assert response.status_code == 422


def test_full_workflow_classify_then_submit_feedback(client):
    """
    Simulates the real user journey: submit a log, get a classification,
    then correct it via the feedback endpoint (the human-in-the-loop path
    that feeds retraining).
    """
    text = "totally novel log format the system has never seen"
    classify_response = client.post("/api/v1/classify", json={"text": text})
    assert classify_response.status_code == 200

    feedback_response = client.post(
        "/api/v1/feedback",
        json={
            "text": text,
            "correct_label": "workflow_error",
            "original_method": classify_response.json()["method_used"],
        },
    )
    assert feedback_response.status_code == 204


def test_llm_outage_still_returns_a_usable_response(client, mock_llm_classifier):
    """If Groq is down, the API must degrade to human_review, never 500."""
    from app.services.llm_classifier import LLMClassificationError

    mock_llm_classifier.classify.side_effect = LLMClassificationError("groq timeout")

    response = client.post(
        "/api/v1/classify",
        json={"text": "an unrecognizable log line with no matching pattern anywhere"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["method_used"] in {"human_review", "ml"}


def test_classify_multi_logs_end_to_end(client):
    """Verifies that multi-line logs are classified individually and return incident reasoning."""
    logs = (
        "2026-09-13 14:22:01.120 UTC [4821] ERROR: deadlock detected on relation 'orders'\n"
        "Multiple login failures occurred on user 9052 account from IP 198.51.100.4\n"
        "total memory: 64172 MB, used: 64000 MB"
    )
    response = client.post("/api/v1/classify/multi", json={"text": logs})
    assert response.status_code == 200
    body = response.json()
    assert body["total_logs"] == 3
    assert "workflow_error" in body["category_counts"]
    assert "security_alert" in body["category_counts"]
    assert "resource_usage" in body["category_counts"]
    assert len(body["items"]) == 3
    assert body["incident_reasoning"]
    assert body["items"][0]["line_number"] == 1
    assert body["items"][0]["label"] == "workflow_error"

