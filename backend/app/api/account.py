"""
GDPR compliance & account management endpoints: data export and right-to-erasure account deletion.
"""
from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.security import get_current_user
from app.core.security import verify_password
from app.db.models import (
    ApiKey,
    ClassificationRecord,
    Notification,
    RefreshToken,
    Subscription,
    UsageCounter,
    User,
)
from app.db.session import get_db
from app.models.schemas import DataExportResponse, DeleteAccountRequest
from app.repositories.postgres import SqlAuditLogRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/account", tags=["account"])


@router.get("/export-data", response_model=DataExportResponse)
def export_my_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    GDPR Right to Data Portability (Article 20):
    Exports all personal data, classification history, API keys, usage logs,
    notifications, and subscription details in structured JSON format.
    """
    classifications = (
        db.query(ClassificationRecord)
        .filter(ClassificationRecord.user_id == current_user.id)
        .order_by(ClassificationRecord.created_at.desc())
        .limit(1000)
        .all()
    )
    api_keys = db.query(ApiKey).filter(ApiKey.user_id == current_user.id).all()
    usage = db.query(UsageCounter).filter(UsageCounter.user_id == current_user.id).all()
    notifications = db.query(Notification).filter(Notification.user_id == current_user.id).all()
    sub = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()

    return DataExportResponse(
        user_profile={
            "id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "role": current_user.role,
            "is_active": current_user.is_active,
            "is_verified": current_user.is_verified,
            "oauth_provider": current_user.oauth_provider,
            "created_at": current_user.created_at.isoformat(),
        },
        classification_history=[
            {
                "id": c.id,
                "text": c.text,
                "label": c.label,
                "confidence": c.confidence,
                "method_used": c.method_used,
                "corrected_label": c.corrected_label,
                "created_at": c.created_at.isoformat(),
            }
            for c in classifications
        ],
        api_keys=[
            {
                "id": k.id,
                "prefix": k.prefix,
                "label": k.label,
                "is_active": k.is_active,
                "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
                "created_at": k.created_at.isoformat(),
            }
            for k in api_keys
        ],
        usage_counters=[
            {"date": u.date, "count": u.count}
            for u in usage
        ],
        notifications=[
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat(),
            }
            for n in notifications
        ],
        subscription={
            "plan_tier": sub.plan_tier,
            "status": sub.status,
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        } if sub else None,
        exported_at=datetime.now(timezone.utc),
    )


@router.delete("/delete-my-account", status_code=status.HTTP_200_OK)
def delete_my_account(
    payload: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    GDPR Right to Erasure / 'Right to be Forgotten' (Article 17):
    Permanently deletes user profile, sessions, API keys, usage records, notifications,
    and anonymizes or purges classification records. Requires verification.
    """
    if payload.confirmation.strip() != "DELETE MY ACCOUNT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation string mismatch. You must send 'DELETE MY ACCOUNT'.",
        )

    # If the user has a password, require and verify it for security
    if current_user.hashed_password:
        if not payload.password or not verify_password(payload.password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password. Account deletion aborted.",
            )

    audit_repo = SqlAuditLogRepository(db)
    user_id = current_user.id
    user_email = current_user.email

    try:
        # Anonymize user classification records so dataset statistics remain intact without PII
        db.query(ClassificationRecord).filter(ClassificationRecord.user_id == user_id).update({"user_id": None})

        # Explicitly delete all tokens and keys
        db.query(RefreshToken).filter(RefreshToken.user_id == user_id).delete()
        db.query(ApiKey).filter(ApiKey.user_id == user_id).delete()
        db.query(UsageCounter).filter(UsageCounter.user_id == user_id).delete()
        db.query(Notification).filter(Notification.user_id == user_id).delete()
        db.query(Subscription).filter(Subscription.user_id == user_id).delete()

        # Delete user record
        db.delete(current_user)
        db.commit()

        audit_repo.log(
            actor_id=None,
            action="GDPR_ACCOUNT_DELETED",
            target=f"user:{user_id}",
            metadata={"email": user_email, "deleted_at": datetime.now(timezone.utc).isoformat()},
        )
        logger.info("Permanently deleted account for user %s (%s) under GDPR Article 17", user_id, user_email)
        return {"status": "deleted", "message": "Your account and all associated personal data have been permanently removed."}
    except Exception as exc:
        db.rollback()
        logger.error("Failed to execute account deletion for user %s: %s", user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete account deletion.",
        )
