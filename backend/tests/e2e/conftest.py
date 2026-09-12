"""
Shared fixtures for the e2e test suite: a real FastAPI TestClient wired to
a real (temp-file) SQLite database, real regex + ML classifiers, and a
mocked Groq boundary - the only external network dependency.
"""
import os
import tempfile

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """
    The rate limiter's counters are process-global (in-memory storage), so
    without a reset they'd leak between test functions in the same pytest
    session and cause flaky, order-dependent 429s - exactly what happened
    once the limiter was added, which is a good sign it actually works.
    """
    from app.api.rate_limit import limiter

    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture(scope="session")
def _test_db_url():
    """
    The DB engine in app.db.session is created once at import time, so the
    env var must be set before app.main is ever imported - hence session
    scope. The file lives for the whole test session and is cleaned up at
    the very end.
    """
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(db_fd)
    url = f"sqlite:///{db_path}"
    os.environ["DATABASE_URL"] = url
    yield url
    try:
        from app.db.session import engine
        engine.dispose()
    except Exception:
        pass
    try:
        if os.path.exists(db_path):
            os.unlink(db_path)
    except PermissionError:
        pass


@pytest.fixture
def client(_test_db_url, trained_ml_classifier, mock_llm_classifier):
    # Import app only after DATABASE_URL is set (see _test_db_url).
    from app.api import deps
    from app.db.models import ClassificationRecord
    from app.db.session import Base, SessionLocal, engine
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

    # Isolate tests from each other without tearing down the shared engine.
    db = SessionLocal()
    db.query(ClassificationRecord).delete()
    db.commit()
    db.close()
    app.dependency_overrides.clear()
