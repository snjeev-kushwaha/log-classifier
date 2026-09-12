"""
User Platform endpoints:
- Personal classification history
- Daily usage quota status
- Personal API key management (create, list, revoke)
"""
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.security import get_current_user
from app.core.config import settings
from app.core.security import generate_random_token, hash_token
from app.db.models import ClassificationRecord, User
from app.db.session import get_db
from app.models.schemas import (
    ApiKeyCreate,
    ApiKeyCreateResponse,
    ApiKeyResponse,
    ClassificationHistoryItem,
    UsageQuotaResponse,
)
from app.repositories.postgres import (
    SqlApiKeyRepository,
    SqlSubscriptionRepository,
    SqlUsageRepository,
)
from app.services.billing import get_tier_daily_quota

router = APIRouter(tags=["user-platform"])


@router.get("/history")
def get_user_history(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve paginated classification history for the authenticated user."""
    q = db.query(ClassificationRecord).filter(ClassificationRecord.user_id == current_user.id)
    total = q.count()
    records = q.order_by(ClassificationRecord.created_at.desc()).offset(skip).limit(limit).all()

    items = [
        ClassificationHistoryItem(
            id=r.id,
            user_id=r.user_id,
            text=r.text,
            label=r.label,
            confidence=r.confidence,
            method_used=r.method_used,
            needs_human_review=r.needs_human_review,
            corrected_label=r.corrected_label,
            created_at=r.created_at,
        )
        for r in records
    ]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.get("/quota", response_model=UsageQuotaResponse)
def get_user_quota(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check remaining daily classification quota for the authenticated user based on their active plan tier."""
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sub_repo = SqlSubscriptionRepository(db)
    user_sub = sub_repo.get_by_user_id(current_user.id)
    daily_limit = get_tier_daily_quota(user_sub.plan_tier if (user_sub and user_sub.status == "active") else "free")

    usage_repo = SqlUsageRepository(db)
    today_count = usage_repo.get_today_count(current_user.id, today_str)
    remaining = max(0, daily_limit - today_count)

    return UsageQuotaResponse(
        today_count=today_count,
        daily_limit=daily_limit,
        remaining=remaining,
    )


@router.post("/api-keys", response_model=ApiKeyCreateResponse, status_code=status.HTTP_201_CREATED)
def create_personal_api_key(
    request: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a personal API key for programmatic access. The raw key is returned only once."""
    api_key_repo = SqlApiKeyRepository(db)
    random_part = generate_random_token(32)
    raw_key = f"log_live_{random_part}"
    prefix = raw_key[:12] + "..."
    key_hash = hash_token(raw_key)

    created_key = api_key_repo.create(
        user_id=current_user.id,
        key_hash=key_hash,
        prefix=prefix,
        label=request.label,
    )

    return ApiKeyCreateResponse(
        id=created_key.id,
        prefix=created_key.prefix,
        label=created_key.label,
        is_active=created_key.is_active,
        last_used_at=created_key.last_used_at,
        created_at=created_key.created_at,
        raw_key=raw_key,
    )


@router.get("/api-keys", response_model=list[ApiKeyResponse])
def list_personal_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all personal API keys belonging to the authenticated user."""
    api_key_repo = SqlApiKeyRepository(db)
    return api_key_repo.list_for_user(current_user.id)


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_200_OK)
def revoke_personal_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke a personal API key."""
    api_key_repo = SqlApiKeyRepository(db)
    success = api_key_repo.revoke(user_id=current_user.id, key_id=key_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found or not owned by user",
        )
    return {"status": "revoked", "key_id": key_id}
