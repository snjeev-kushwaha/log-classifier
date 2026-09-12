"""
In-app notification endpoints for batch completion, quota warnings, and system alerts.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.security import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import NotificationListResponse, NotificationResponse
from app.repositories.postgres import SqlNotificationRepository

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
def get_user_notifications(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List paginated notifications and unread count for the authenticated user."""
    notif_repo = SqlNotificationRepository(db)
    items, total, unread_count = notif_repo.list_for_user(current_user.id, skip=skip, limit=limit)
    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in items],
        total=total,
        unread_count=unread_count,
    )


@router.patch("/{notification_id}/read", status_code=status.HTTP_200_OK)
def mark_notification_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a single notification as read."""
    notif_repo = SqlNotificationRepository(db)
    success = notif_repo.mark_read(current_user.id, notification_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    return {"status": "read", "id": notification_id}


@router.post("/mark-all-read", status_code=status.HTTP_200_OK)
def mark_all_notifications_as_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all notifications as read for the authenticated user."""
    notif_repo = SqlNotificationRepository(db)
    updated_count = notif_repo.mark_all_read(current_user.id)
    return {"status": "all_marked_read", "count": updated_count}
