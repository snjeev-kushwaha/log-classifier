"""
Authentication endpoints: signup, login, token refresh (with rotation), logout, and /me profile.
"""
from datetime import datetime, timedelta, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.security import get_current_user
from app.core.config import settings
from app.core.security import (
    create_access_token,
    generate_random_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import (
    TokenRefreshRequest,
    TokenResponse,
    UserLoginRequest,
    UserResponse,
    UserSignupRequest,
)
from app.repositories.postgres import SqlRefreshTokenRepository, SqlUserRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(request: UserSignupRequest, db: Session = Depends(get_db)):
    user_repo = SqlUserRepository(db)
    existing_user = user_repo.get_by_email(request.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered",
        )

    # First user registered in an empty DB automatically receives admin role for easy bootstrapping
    _, total_users = user_repo.list_users(limit=1)
    role = "admin" if total_users == 0 else "user"

    hashed_pw = hash_password(request.password)
    user = user_repo.create(
        email=request.email,
        hashed_password=hashed_pw,
        full_name=request.full_name,
        role=role,
    )
    logger.info("User registered successfully", extra={"user_id": user.id, "email": user.email, "role": role})
    return user


@router.post("/login", response_model=TokenResponse)
def login(request: UserLoginRequest, req_meta: Request, db: Session = Depends(get_db)):
    user_repo = SqlUserRepository(db)
    refresh_repo = SqlRefreshTokenRepository(db)

    user = user_repo.get_by_email(request.email)
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact an administrator.",
        )

    # Generate JWT Access Token
    access_token = create_access_token(
        subject=user.id,
        extra_claims={"email": user.email, "role": user.role},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )

    # Generate & persist cryptographically secure rotatable Refresh Token
    raw_refresh_token = generate_random_token(48)
    token_hash_str = hash_token(raw_refresh_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    client_ip = req_meta.client.host if req_meta.client else None

    refresh_repo.create(
        user_id=user.id,
        token_hash=token_hash_str,
        expires_at=expires_at,
        ip=client_ip,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(request: TokenRefreshRequest, req_meta: Request, db: Session = Depends(get_db)):
    refresh_repo = SqlRefreshTokenRepository(db)
    user_repo = SqlUserRepository(db)

    token_hash_str = hash_token(request.refresh_token)
    token = refresh_repo.get_by_hash(token_hash_str)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    # Replay protection: If token is already revoked, revoke all tokens for this user
    if token.revoked_at is not None:
        refresh_repo.revoke_all_for_user(token.user_id)
        logger.warning(
            "Refresh token replay detected. Revoking all sessions for user",
            extra={"user_id": token.user_id},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked or replayed. Please log in again.",
        )

    # Check expiration
    now = datetime.now(timezone.utc)
    # Ensure token.expires_at has timezone for comparison
    token_exp = token.expires_at.replace(tzinfo=timezone.utc) if token.expires_at.tzinfo is None else token.expires_at
    if token_exp < now:
        refresh_repo.revoke(token)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired. Please log in again.",
        )

    user = user_repo.get_by_id(token.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is no longer active",
        )

    # Revoke used refresh token (Token Rotation)
    refresh_repo.revoke(token)

    # Issue new pair
    new_access_token = create_access_token(
        subject=user.id,
        extra_claims={"email": user.email, "role": user.role},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    new_raw_refresh_token = generate_random_token(48)
    new_token_hash = hash_token(new_raw_refresh_token)
    new_expires_at = now + timedelta(days=settings.refresh_token_expire_days)
    client_ip = req_meta.client.host if req_meta.client else None

    refresh_repo.create(
        user_id=user.id,
        token_hash=new_token_hash,
        expires_at=new_expires_at,
        ip=client_ip,
    )

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_raw_refresh_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/logout")
def logout(request: TokenRefreshRequest, db: Session = Depends(get_db)):
    refresh_repo = SqlRefreshTokenRepository(db)
    token_hash_str = hash_token(request.refresh_token)
    token = refresh_repo.get_by_hash(token_hash_str)
    if token and token.revoked_at is None:
        refresh_repo.revoke(token)
    return {"status": "logged_out"}


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(user: User = Depends(get_current_user)):
    return user


