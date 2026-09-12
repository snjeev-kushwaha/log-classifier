"""
Dependency-injection wiring. Kept separate from main.py so tests can
override get_classification_service() with a mocked/stubbed instance
without spinning up real models or hitting the real Groq API.
"""
from functools import lru_cache

from app.core.config import settings
from app.services.classification_service import ClassificationService
from app.services.llm_classifier import LLMClassifier
from app.services.ml_classifier import MLClassifier
from app.services.regex_classifier import RegexClassifier

CANDIDATE_LABELS = ["security_alert", "resource_usage", "workflow_error", "unclassified"]


@lru_cache
def get_classification_service() -> ClassificationService:
    regex_classifier = RegexClassifier()

    ml_classifier: MLClassifier | None = None
    try:
        ml_classifier = MLClassifier.load(settings.model_registry_path, settings.embedding_model_name)
    except FileNotFoundError:
        ml_classifier = None  # no trained model yet - LLM will handle everything until trained

    llm_classifier: LLMClassifier | None = None
    if settings.groq_api_key:
        llm_classifier = LLMClassifier(
            api_key=settings.groq_api_key,
            model=settings.groq_model,
            timeout_seconds=settings.llm_timeout_seconds,
            max_retries=settings.llm_max_retries,
        )

    return ClassificationService(
        regex_classifier=regex_classifier,
        ml_classifier=ml_classifier,
        llm_classifier=llm_classifier,
        candidate_labels=CANDIDATE_LABELS,
        ml_confidence_threshold=settings.ml_confidence_threshold,
        llm_fallback_confidence_threshold=settings.llm_fallback_confidence_threshold,
        llm_only_sources=settings.llm_only_sources_set,
    )


# --- PostgreSQL Repository Dependency Wiring ---
# Provides PostgreSQL repository instances satisfying abstract repository interfaces.

from fastapi import Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.repositories.base import (
    IApiKeyRepository,
    IAuditLogRepository,
    IRefreshTokenRepository,
    IRegexRuleRepository,
    IUsageRepository,
    IUserRepository,
)
from app.repositories.postgres import (
    SqlApiKeyRepository,
    SqlAuditLogRepository,
    SqlRefreshTokenRepository,
    SqlRegexRuleRepository,
    SqlUsageRepository,
    SqlUserRepository,
)


def get_user_repository(db: Session = Depends(get_db)) -> IUserRepository:
    """Provides the active User repository. Currently wired to PostgreSQL."""
    return SqlUserRepository(db)


def get_refresh_token_repository(db: Session = Depends(get_db)) -> IRefreshTokenRepository:
    return SqlRefreshTokenRepository(db)


def get_audit_log_repository(db: Session = Depends(get_db)) -> IAuditLogRepository:
    return SqlAuditLogRepository(db)


def get_api_key_repository(db: Session = Depends(get_db)) -> IApiKeyRepository:
    return SqlApiKeyRepository(db)


def get_usage_repository(db: Session = Depends(get_db)) -> IUsageRepository:
    return SqlUsageRepository(db)


def get_regex_rule_repository(db: Session = Depends(get_db)) -> IRegexRuleRepository:
    return SqlRegexRuleRepository(db)

