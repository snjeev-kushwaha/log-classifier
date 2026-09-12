"""
Secrets Management and Secret Rotation Layer.
Supports:
- Abstract ISecretsManager interface.
- Cloud / Vault / Env backed secret resolution.
- Cryptographic JWT_SECRET rotation with dual-key verification window.
- Seamless zero-downtime refresh: client sessions persist through server-side refresh tokens.
"""
from abc import ABC, abstractmethod
from datetime import datetime, timezone
import hashlib
import logging
import os
import secrets
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class ISecretsManager(ABC):
    """Abstract interface for application secrets management."""

    @abstractmethod
    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Retrieve a secret by name."""
        pass

    @abstractmethod
    def set_secret(self, key: str, value: str) -> None:
        """Store or update a secret value."""
        pass

    @abstractmethod
    def rotate_secret(self, key: str, new_value: Optional[str] = None) -> tuple[str, Optional[str]]:
        """
        Rotate a secret. Moves the current secret to `<key>_PREVIOUS` and sets a new secret.
        Returns (new_current_value, previous_value).
        """
        pass

    @abstractmethod
    def get_status(self) -> dict[str, Any]:
        """Returns metadata about the active secrets provider and rotation timestamps."""
        pass


class SecretsManager(ISecretsManager):
    """
    Secrets Manager implementation supporting runtime in-memory caching,
    environment injection (AWS / Vault / CI secrets), and scheduled key rotation.
    """

    def __init__(self):
        self._cache: dict[str, str] = {}
        self._rotation_history: list[dict[str, Any]] = []
        self._backend_type = settings.secrets_manager_backend

        # Initialize defaults from configuration
        if settings.jwt_secret_key:
            self._cache["JWT_SECRET_KEY"] = settings.jwt_secret_key
        if settings.jwt_secret_key_previous:
            self._cache["JWT_SECRET_KEY_PREVIOUS"] = settings.jwt_secret_key_previous
        if settings.groq_api_key:
            self._cache["GROQ_API_KEY"] = settings.groq_api_key
        if settings.google_client_secret:
            self._cache["GOOGLE_CLIENT_SECRET"] = settings.google_client_secret
        if settings.github_client_secret:
            self._cache["GITHUB_CLIENT_SECRET"] = settings.github_client_secret

    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        key_upper = key.upper()
        if key_upper in self._cache:
            return self._cache[key_upper]
        env_val = os.environ.get(key_upper)
        if env_val is not None:
            return env_val
        return default

    def set_secret(self, key: str, value: str) -> None:
        self._cache[key.upper()] = value

    def rotate_secret(self, key: str, new_value: Optional[str] = None) -> tuple[str, Optional[str]]:
        key_upper = key.upper()
        old_current = self.get_secret(key_upper)

        if not new_value:
            new_value = secrets.token_urlsafe(48)

        prev_key = f"{key_upper}_PREVIOUS"
        if old_current:
            self._cache[prev_key] = old_current
            if key_upper == "JWT_SECRET_KEY":
                settings.jwt_secret_key_previous = old_current

        self._cache[key_upper] = new_value
        if key_upper == "JWT_SECRET_KEY":
            settings.jwt_secret_key = new_value

        now_iso = datetime.now(timezone.utc).isoformat()
        key_hash_preview = hashlib.sha256(new_value.encode("utf-8")).hexdigest()[:8]
        self._rotation_history.append({
            "key": key_upper,
            "rotated_at": now_iso,
            "key_hash_preview": key_hash_preview,
            "has_previous_key": old_current is not None,
        })

        logger.info(
            "Secret rotated successfully: key=%s, hash_preview=%s",
            key_upper,
            key_hash_preview,
        )
        return new_value, old_current

    def get_status(self) -> dict[str, Any]:
        jwt_curr = self.get_secret("JWT_SECRET_KEY", "")
        jwt_prev = self.get_secret("JWT_SECRET_KEY_PREVIOUS")
        return {
            "backend": self._backend_type,
            "jwt_current_hash_preview": hashlib.sha256(jwt_curr.encode()).hexdigest()[:8] if jwt_curr else None,
            "jwt_previous_retained": jwt_prev is not None,
            "rotation_count": len(self._rotation_history),
            "last_rotation": self._rotation_history[-1] if self._rotation_history else None,
        }


# Global singleton instance
secrets_manager = SecretsManager()


def get_secrets_manager() -> ISecretsManager:
    return secrets_manager
