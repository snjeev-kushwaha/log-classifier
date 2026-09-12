"""
Repository interfaces for clean database access abstraction.
Implements the repository pattern across PostgreSQL models and services.
"""
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Optional

from app.db.models import (
    ApiKey,
    AuditLog,
    ClassificationRecord,
    DbRegexRule,
    RefreshToken,
    UsageCounter,
    User,
)


class IUserRepository(ABC):
    @abstractmethod
    def get_by_id(self, user_id: int) -> Optional[User]:
        pass

    @abstractmethod
    def get_by_email(self, email: str) -> Optional[User]:
        pass

    @abstractmethod
    def get_by_oauth(self, provider: str, subject_id: str) -> Optional[User]:
        pass

    @abstractmethod
    def create(self, email: str, hashed_password: str, full_name: Optional[str] = None, role: str = "user") -> User:
        pass

    @abstractmethod
    def create_oauth(
        self,
        email: str,
        provider: str,
        subject_id: str,
        full_name: Optional[str] = None,
        role: str = "user",
    ) -> User:
        pass

    @abstractmethod
    def link_oauth(
        self,
        user: User,
        provider: str,
        subject_id: str,
        full_name: Optional[str] = None,
    ) -> User:
        pass

    @abstractmethod
    def update(self, user: User, **kwargs: Any) -> User:
        pass

    @abstractmethod
    def list_users(self, skip: int = 0, limit: int = 50, role: Optional[str] = None, is_active: Optional[bool] = None, query: Optional[str] = None) -> tuple[list[User], int]:
        pass


class IRefreshTokenRepository(ABC):
    @abstractmethod
    def create(self, user_id: int, token_hash: str, expires_at: datetime, ip: Optional[str] = None) -> RefreshToken:
        pass

    @abstractmethod
    def get_by_hash(self, token_hash: str) -> Optional[RefreshToken]:
        pass

    @abstractmethod
    def revoke(self, token: RefreshToken) -> None:
        pass

    @abstractmethod
    def revoke_all_for_user(self, user_id: int) -> None:
        pass


class IAuditLogRepository(ABC):
    @abstractmethod
    def log(self, actor_id: Optional[int], action: str, target: Optional[str] = None, metadata: Optional[dict[str, Any]] = None) -> AuditLog:
        pass

    @abstractmethod
    def list_logs(self, skip: int = 0, limit: int = 50, action: Optional[str] = None, actor_id: Optional[int] = None) -> tuple[list[AuditLog], int]:
        pass


class IRegexRuleRepository(ABC):
    @abstractmethod
    def list_active(self) -> list[DbRegexRule]:
        pass

    @abstractmethod
    def create(self, label: str, pattern: str, description: Optional[str] = None) -> DbRegexRule:
        pass

    @abstractmethod
    def delete(self, rule_id: int) -> bool:
        pass


class IApiKeyRepository(ABC):
    @abstractmethod
    def create(self, user_id: int, key_hash: str, prefix: str, label: str) -> ApiKey:
        pass

    @abstractmethod
    def get_by_hash(self, key_hash: str) -> Optional[ApiKey]:
        pass

    @abstractmethod
    def list_for_user(self, user_id: int) -> list[ApiKey]:
        pass

    @abstractmethod
    def revoke(self, user_id: int, key_id: int) -> bool:
        pass

    @abstractmethod
    def touch_last_used(self, api_key: ApiKey) -> None:
        pass


class IUsageRepository(ABC):
    @abstractmethod
    def increment_and_check(self, user_id: int, date_str: str, max_allowed: int) -> tuple[int, bool]:
        """Returns (current_count, is_within_limit)."""
        pass

    @abstractmethod
    def get_today_count(self, user_id: int, date_str: str) -> int:
        pass
