"""
SQLAlchemy / PostgreSQL implementations of repository interfaces.
"""
from datetime import datetime, timezone
import json
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import (
    ApiKey,
    AuditLog,
    DbRegexRule,
    RefreshToken,
    UsageCounter,
    User,
)
from app.repositories.base import (
    IApiKeyRepository,
    IAuditLogRepository,
    IRefreshTokenRepository,
    IRegexRuleRepository,
    IUsageRepository,
    IUserRepository,
)


class SqlUserRepository(IUserRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, user_id: int) -> Optional[User]:
        return self.db.query(User).filter(User.id == user_id).first()

    def get_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(func.lower(User.email) == email.lower().strip()).first()

    def get_by_oauth(self, provider: str, subject_id: str) -> Optional[User]:
        return (
            self.db.query(User)
            .filter(User.oauth_provider == provider, User.oauth_subject_id == str(subject_id))
            .first()
        )

    def create(self, email: str, hashed_password: str, full_name: Optional[str] = None, role: str = "user") -> User:
        user = User(
            email=email.lower().strip(),
            hashed_password=hashed_password,
            full_name=full_name,
            role=role,
            is_active=True,
            is_verified=False,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def create_oauth(
        self,
        email: str,
        provider: str,
        subject_id: str,
        full_name: Optional[str] = None,
        role: str = "user",
    ) -> User:
        user = User(
            email=email.lower().strip(),
            hashed_password=None,
            full_name=full_name,
            role=role,
            oauth_provider=provider,
            oauth_subject_id=str(subject_id),
            is_active=True,
            is_verified=True,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def link_oauth(
        self,
        user: User,
        provider: str,
        subject_id: str,
        full_name: Optional[str] = None,
    ) -> User:
        user.oauth_provider = provider
        user.oauth_subject_id = str(subject_id)
        user.is_verified = True
        if full_name and not user.full_name:
            user.full_name = full_name
        self.db.commit()
        self.db.refresh(user)
        return user

    def update(self, user: User, **kwargs: Any) -> User:
        for key, val in kwargs.items():
            if hasattr(user, key):
                setattr(user, key, val)
        self.db.commit()
        self.db.refresh(user)
        return user

    def list_users(
        self,
        skip: int = 0,
        limit: int = 50,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
        query: Optional[str] = None,
    ) -> tuple[list[User], int]:
        q = self.db.query(User)
        if role:
            q = q.filter(User.role == role)
        if is_active is not None:
            q = q.filter(User.is_active == is_active)
        if query:
            pattern = f"%{query}%"
            q = q.filter((User.email.ilike(pattern)) | (User.full_name.ilike(pattern)))
        total = q.count()
        users = q.order_by(User.created_at.desc()).offset(skip).limit(limit).all()
        return users, total


class SqlRefreshTokenRepository(IRefreshTokenRepository):
    def __init__(self, db: Session):
        self.db = db

    def create(self, user_id: int, token_hash: str, expires_at: datetime, ip: Optional[str] = None) -> RefreshToken:
        token = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            created_by_ip=ip,
        )
        self.db.add(token)
        self.db.commit()
        self.db.refresh(token)
        return token

    def get_by_hash(self, token_hash: str) -> Optional[RefreshToken]:
        return self.db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

    def revoke(self, token: RefreshToken) -> None:
        token.revoked_at = datetime.now(timezone.utc)
        self.db.commit()

    def revoke_all_for_user(self, user_id: int) -> None:
        now = datetime.now(timezone.utc)
        self.db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        ).update({"revoked_at": now})
        self.db.commit()


class SqlAuditLogRepository(IAuditLogRepository):
    def __init__(self, db: Session):
        self.db = db

    def log(
        self,
        actor_id: Optional[int],
        action: str,
        target: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditLog:
        audit_entry = AuditLog(
            actor_id=actor_id,
            action=action,
            target=target,
            metadata_json=json.dumps(metadata) if metadata else None,
        )
        self.db.add(audit_entry)
        self.db.commit()
        self.db.refresh(audit_entry)
        return audit_entry

    def list_logs(
        self,
        skip: int = 0,
        limit: int = 50,
        action: Optional[str] = None,
        actor_id: Optional[int] = None,
    ) -> tuple[list[AuditLog], int]:
        q = self.db.query(AuditLog)
        if action:
            q = q.filter(AuditLog.action == action)
        if actor_id:
            q = q.filter(AuditLog.actor_id == actor_id)
        total = q.count()
        logs = q.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
        return logs, total


class SqlRegexRuleRepository(IRegexRuleRepository):
    def __init__(self, db: Session):
        self.db = db

    def list_active(self) -> list[DbRegexRule]:
        return self.db.query(DbRegexRule).filter(DbRegexRule.is_active == True).order_by(DbRegexRule.id.asc()).all()

    def create(self, label: str, pattern: str, description: Optional[str] = None) -> DbRegexRule:
        rule = DbRegexRule(
            label=label,
            pattern=pattern,
            description=description,
            is_active=True,
        )
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def delete(self, rule_id: int) -> bool:
        rule = self.db.query(DbRegexRule).filter(DbRegexRule.id == rule_id).first()
        if not rule:
            return False
        self.db.delete(rule)
        self.db.commit()
        return True


class SqlApiKeyRepository(IApiKeyRepository):
    def __init__(self, db: Session):
        self.db = db

    def create(self, user_id: int, key_hash: str, prefix: str, label: str) -> ApiKey:
        key = ApiKey(
            user_id=user_id,
            key_hash=key_hash,
            prefix=prefix,
            label=label,
            is_active=True,
        )
        self.db.add(key)
        self.db.commit()
        self.db.refresh(key)
        return key

    def get_by_hash(self, key_hash: str) -> Optional[ApiKey]:
        return self.db.query(ApiKey).filter(ApiKey.key_hash == key_hash, ApiKey.is_active == True).first()

    def list_for_user(self, user_id: int) -> list[ApiKey]:
        return self.db.query(ApiKey).filter(ApiKey.user_id == user_id).order_by(ApiKey.created_at.desc()).all()

    def revoke(self, user_id: int, key_id: int) -> bool:
        key = self.db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user_id).first()
        if not key:
            return False
        key.is_active = False
        self.db.commit()
        return True

    def touch_last_used(self, api_key: ApiKey) -> None:
        api_key.last_used_at = datetime.now(timezone.utc)
        self.db.commit()


class SqlUsageRepository(IUsageRepository):
    def __init__(self, db: Session):
        self.db = db

    def increment_and_check(self, user_id: int, date_str: str, max_allowed: int) -> tuple[int, bool]:
        counter = self.db.query(UsageCounter).filter(
            UsageCounter.user_id == user_id,
            UsageCounter.date == date_str,
        ).first()

        if not counter:
            counter = UsageCounter(user_id=user_id, date=date_str, count=1)
            self.db.add(counter)
            self.db.commit()
            return 1, 1 <= max_allowed

        counter.count += 1
        self.db.commit()
        return counter.count, counter.count <= max_allowed

    def get_today_count(self, user_id: int, date_str: str) -> int:
        counter = self.db.query(UsageCounter).filter(
            UsageCounter.user_id == user_id,
            UsageCounter.date == date_str,
        ).first()
        return counter.count if counter else 0
