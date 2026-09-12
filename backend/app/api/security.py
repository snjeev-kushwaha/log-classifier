"""
Authentication and Authorization dependencies:
- JWT Bearer authentication
- Personal & master API key authentication
- Role-based Access Control (RBAC)
"""
from typing import Callable, Optional

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token, hash_token
from app.db.models import User
from app.db.session import get_db
from app.repositories.postgres import SqlApiKeyRepository, SqlUserRepository

security_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    auth_creds: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    x_api_key: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """
    Authenticate user via either:
    1. Authorization: Bearer <JWT>
    2. X-API-Key: <personal_api_key> (e.g. log_...)
    3. X-API-Key matching static master keys in settings.api_keys (assigned admin or first user)
    """
    user_repo = SqlUserRepository(db)
    api_key_repo = SqlApiKeyRepository(db)

    # 1. Bearer JWT
    if auth_creds and auth_creds.credentials:
        try:
            payload = decode_access_token(auth_creds.credentials)
            user_id = int(payload.get("sub", 0))
        except (jwt.PyJWTError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = user_repo.get_by_id(user_id)
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account does not exist or is deactivated",
            )
        return user

    # 2. Personal API Key
    if x_api_key:
        # Check personal API key table
        key_hash = hash_token(x_api_key)
        matched_key = api_key_repo.get_by_hash(key_hash)
        if matched_key:
            api_key_repo.touch_last_used(matched_key)
            user = user_repo.get_by_id(matched_key.user_id)
            if user and user.is_active:
                return user

        # 3. Master Static API Keys
        if settings.api_keys_set and x_api_key in settings.api_keys_set:
            # Fallback to a synthetic admin user or first admin in db
            admin_user = db.query(User).filter(User.role == "admin").first()
            if admin_user:
                return admin_user
            return User(id=0, email="master-key@system.local", role="admin", is_active=True)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Provide a valid Bearer token or API key.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_optional_current_user(
    auth_creds: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    x_api_key: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Extract authenticated user if present, or return None for unauthenticated requests."""
    try:
        return get_current_user(auth_creds=auth_creds, x_api_key=x_api_key, db=db)
    except HTTPException:
        return None


def require_role(*roles: str) -> Callable[[User], User]:
    """RBAC dependency ensuring the authenticated user has at least one of the specified roles."""
    def _role_checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: role '{user.role}' is not authorized for this resource.",
            )
        return user

    return _role_checker


def require_api_key(
    x_api_key: str = Header(default=""),
    auth_creds: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> None:
    """Validate credentials if provided, or enforce static API key when configured."""
    # If caller explicitly supplied a Bearer token or an API key, validate it strictly
    if auth_creds or (x_api_key and (x_api_key.startswith("log_") or settings.api_keys_set)):
        get_current_user(auth_creds=auth_creds, x_api_key=x_api_key if x_api_key else None, db=db)
        return

    valid_keys = settings.api_keys_set
    if not valid_keys:
        return  # auth disabled - local dev only

    if x_api_key not in valid_keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key",
        )

