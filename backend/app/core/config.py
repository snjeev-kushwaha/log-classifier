"""
Central configuration for the hybrid log classification service.
All values are overridable via environment variables (.env file supported).
"""
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", protected_namespaces=("settings_",))

    app_name: str = "hybrid-log-classifier"
    environment: str = "development"

    # --- Groq / LLM settings ---
    groq_api_key: str = ""
    groq_model: str = "deepseek-r1-distill-llama-70b"  # or a Qwen model on Groq
    llm_timeout_seconds: float = 8.0
    llm_max_retries: int = 2

    # --- ML classifier settings ---
    ml_confidence_threshold: float = 0.75   # below this -> escalate to LLM / review
    min_samples_per_class_for_ml: int = 50  # below this -> route to LLM instead
    embedding_model_name: str = "all-MiniLM-L6-v2"
    model_registry_path: str = "artifacts/model_registry"

    # --- Routing thresholds ---
    llm_fallback_confidence_threshold: float = 0.6  # below this -> human review queue
    # Comma-separated list of `source` values that always route straight to
    # the LLM, bypassing regex/ML entirely - for sources known ahead of
    # time to have no usable training coverage (e.g. a legacy system).
    llm_only_sources: str = ""

    # --- Database ---
    database_url: str = "sqlite:///./log_classifier.db"

    # --- CORS ---
    frontend_origin: str = "http://localhost:5173"

    # --- API security & JWT Auth ---
    # Comma-separated list of accepted static API keys.
    api_keys: str = ""
    jwt_secret_key: str = "dev-jwt-secret-key-super-secure-change-in-production-1234567890"
    jwt_secret_key_previous: Optional[str] = None
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 14
    daily_user_quota: int = 1000
    secrets_manager_backend: str = "vault_or_env"

    # --- OAuth2 settings ---
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    oauth_redirect_base_url: str = "http://localhost:8000"

    # Requests per minute per client IP, applied to the classification
    # endpoints. Batch CSV uploads get a stricter separate limit below.
    rate_limit_per_minute: int = 60
    batch_rate_limit_per_minute: int = 5
    max_batch_rows: int = 5000

    # --- Observability ---
    log_level: str = "INFO"
    json_logs: bool = True

    @property
    def llm_only_sources_set(self) -> set[str]:
        return {s.strip() for s in self.llm_only_sources.split(",") if s.strip()}

    @property
    def api_keys_set(self) -> set[str]:
        return {k.strip() for k in self.api_keys.split(",") if k.strip()}


settings = Settings()
