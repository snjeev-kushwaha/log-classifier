"""
Authentication endpoints: signup, login, token refresh (with rotation), logout, and /me profile.
"""
from datetime import datetime, timedelta, timezone
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.security import get_current_user
from app.core.config import settings
from app.core.oauth import oauth
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
    OAuthLoginRequest,
    TokenRefreshRequest,
    TokenResponse,
    UserLoginRequest,
    UserResponse,
    UserSignupRequest,
)
from app.repositories.postgres import (
    SqlAuditLogRepository,
    SqlRefreshTokenRepository,
    SqlUserRepository,
)

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


def issue_tokens_for_user(user: User, client_ip: Optional[str], db: Session) -> TokenResponse:
    refresh_repo = SqlRefreshTokenRepository(db)
    access_token = create_access_token(
        subject=user.id,
        extra_claims={"email": user.email, "role": user.role},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    raw_refresh_token = generate_random_token(48)
    token_hash_str = hash_token(raw_refresh_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)

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


def handle_oauth_user_flow(
    provider: str,
    subject_id: str,
    email: str,
    full_name: Optional[str],
    client_ip: Optional[str],
    db: Session,
) -> tuple[User, TokenResponse]:
    """
    Handles OAuth user authentication and account linking.
    Account linking policy:
    1. If user with matching (oauth_provider, oauth_subject_id) exists: log them in directly.
    2. If no matching subject_id exists, but an account with the verified email exists (e.g. created via password):
       LINK the OAuth credentials (oauth_provider, oauth_subject_id) to the existing account and mark
       is_verified=True without creating a duplicate user.
    3. If neither exists, create a brand-new user with hashed_password=None, oauth_provider, oauth_subject_id.
    """
    user_repo = SqlUserRepository(db)
    audit_repo = SqlAuditLogRepository(db)

    email_clean = email.lower().strip()
    user = user_repo.get_by_oauth(provider, str(subject_id))

    if user:
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is deactivated. Contact an administrator.",
            )
        if full_name and not user.full_name:
            user_repo.update(user, full_name=full_name)
    else:
        existing = user_repo.get_by_email(email_clean)
        if existing:
            if not existing.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account is deactivated. Contact an administrator.",
                )
            user = user_repo.link_oauth(existing, provider=provider, subject_id=str(subject_id), full_name=full_name)
            try:
                audit_repo.log(
                    action="OAUTH_ACCOUNT_LINKED",
                    actor_id=user.id,
                    target=f"user:{user.id}",
                    metadata={"provider": provider, "email": email_clean},
                )
            except Exception as e:
                logger.warning("Failed to record audit log for OAuth linking: %s", e)
            logger.info("Linked existing user account with %s: user_id=%s", provider, user.id)
        else:
            _, total_users = user_repo.list_users(limit=1)
            role = "admin" if total_users == 0 else "user"
            user = user_repo.create_oauth(
                email=email_clean,
                provider=provider,
                subject_id=str(subject_id),
                full_name=full_name,
                role=role,
            )
            try:
                audit_repo.log(
                    action="OAUTH_USER_CREATED",
                    actor_id=user.id,
                    target=f"user:{user.id}",
                    metadata={"provider": provider, "email": email_clean, "role": role},
                )
            except Exception as e:
                logger.warning("Failed to record audit log for OAuth creation: %s", e)
            logger.info("Created new user via %s: user_id=%s", provider, user.id)

    tokens = issue_tokens_for_user(user, client_ip=client_ip, db=db)
    return user, tokens


@router.post("/login", response_model=TokenResponse)
def login(request: UserLoginRequest, req_meta: Request, db: Session = Depends(get_db)):
    user_repo = SqlUserRepository(db)

    user = user_repo.get_by_email(request.email)
    if not user or not user.hashed_password or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact an administrator.",
        )

    client_ip = req_meta.client.host if req_meta.client else None
    return issue_tokens_for_user(user, client_ip, db)


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


@router.post("/oauth/token-login", response_model=TokenResponse)
def oauth_token_login(request: OAuthLoginRequest, req_meta: Request, db: Session = Depends(get_db)):
    """
    Direct OAuth login / token exchange endpoint for frontend SPAs, mobile apps, or automated tests.
    Authenticates or links the user using verified identity information and returns JWT tokens.
    """
    client_ip = req_meta.client.host if req_meta.client else None
    _, tokens = handle_oauth_user_flow(
        provider=request.provider,
        subject_id=request.subject_id,
        email=request.email,
        full_name=request.full_name,
        client_ip=client_ip,
        db=db,
    )
    return tokens


@router.get("/oauth/{provider}/authorize")
async def oauth_authorize(provider: str, request: Request):
    """
    Initiates standard authorization code flow with the specified OAuth2 provider (google/github).
    """
    if provider not in ("google", "github"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported OAuth provider: {provider}")

    if provider == "google" and not settings.google_client_id:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Google OAuth is not configured")
    if provider == "github" and not settings.github_client_id:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="GitHub OAuth is not configured")

    client = oauth.create_client(provider)
    if not client:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="OAuth client initialization failed")

    redirect_uri = f"{settings.oauth_redirect_base_url.rstrip('/')}/api/v1/auth/oauth/{provider}/callback"
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/oauth/{provider}/callback")
async def oauth_callback(provider: str, request: Request, db: Session = Depends(get_db)):
    """
    OAuth callback handling authorization code exchange, user profile extraction, account linking,
    and redirection to frontend with issued tokens.
    """
    if provider not in ("google", "github"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported OAuth provider: {provider}")

    client = oauth.create_client(provider)
    if not client:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="OAuth client not found")

    try:
        token = await client.authorize_access_token(request)
    except Exception as exc:
        logger.error("OAuth token exchange failed for provider %s: %s", provider, exc)
        return RedirectResponse(
            url=f"{settings.frontend_origin.rstrip('/')}?oauth_error={str(exc)}"
        )

    subject_id = None
    email = None
    full_name = None

    try:
        if provider == "google":
            user_info = token.get("userinfo")
            if not user_info:
                user_info = await client.userinfo(token=token)
            subject_id = str(user_info.get("sub"))
            email = user_info.get("email")
            full_name = user_info.get("name")
        elif provider == "github":
            resp = await client.get("user", token=token)
            profile = resp.json()
            subject_id = str(profile.get("id"))
            full_name = profile.get("name") or profile.get("login")
            email = profile.get("email")
            if not email:
                emails_resp = await client.get("user/emails", token=token)
                emails = emails_resp.json()
                for em in emails:
                    if em.get("primary") and em.get("verified"):
                        email = em.get("email")
                        break

        if not email or not subject_id:
            raise ValueError("Could not retrieve email or subject ID from provider")

        client_ip = request.client.host if request.client else None
        _, tokens = handle_oauth_user_flow(
            provider=provider,
            subject_id=subject_id,
            email=email,
            full_name=full_name,
            client_ip=client_ip,
            db=db,
        )

        frontend_redirect = (
            f"{settings.frontend_origin.rstrip('/')}?oauth_token={tokens.access_token}&refresh_token={tokens.refresh_token}"
        )
        return RedirectResponse(url=frontend_redirect)
    except Exception as exc:
        logger.error("OAuth user processing failed: %s", exc)
        return RedirectResponse(
            url=f"{settings.frontend_origin.rstrip('/')}?oauth_error={str(exc)}"
        )



