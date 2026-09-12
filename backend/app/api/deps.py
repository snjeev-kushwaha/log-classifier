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
