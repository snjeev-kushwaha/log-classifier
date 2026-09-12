"""
Core security utilities: password hashing, JWT generation/validation,
and cryptographic token hashing.
"""
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from typing import Any, Optional

import bcrypt
import jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    """Hash a password with bcrypt and return as utf-8 string."""
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    subject: str | int,
    extra_claims: Optional[dict[str, Any]] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT access token with expiration and claims."""
    from app.core.secrets import secrets_manager

    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.access_token_expire_minutes)

    payload: dict[str, Any] = {
        "sub": str(subject),
        "jti": generate_random_token(16),
        "iat": now,
        "exp": expire,
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)

    secret_key = secrets_manager.get_secret("JWT_SECRET_KEY", settings.jwt_secret_key)
    encoded = jwt.encode(payload, secret_key, algorithm=settings.jwt_algorithm)
    return encoded


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT access token.
    Supports dual-key grace period during scheduled secret rotation:
    1. Attempts verification with current secret key.
    2. If signature fails and a previous secret exists, attempts verification with previous secret.
    """
    from app.core.secrets import secrets_manager

    current_key = secrets_manager.get_secret("JWT_SECRET_KEY", settings.jwt_secret_key)
    try:
        return jwt.decode(
            token,
            current_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.InvalidSignatureError:
        prev_key = secrets_manager.get_secret("JWT_SECRET_KEY_PREVIOUS", settings.jwt_secret_key_previous)
        if prev_key:
            return jwt.decode(
                token,
                prev_key,
                algorithms=[settings.jwt_algorithm],
            )
        raise


def generate_random_token(length: int = 48) -> str:
    """Generate a high-entropy URL-safe random string for refresh tokens / API keys."""
    return secrets.token_urlsafe(length)


def hash_token(token: str) -> str:
    """Compute SHA-256 hash of a token for secure database storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
