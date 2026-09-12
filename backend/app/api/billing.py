"""
Billing endpoints: plan tiers, Stripe checkout sessions, customer subscriptions, and webhooks.
"""
from datetime import datetime, timezone
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from sqlalchemy.orm import Session

from app.api.security import get_current_user
from app.core.config import settings
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import (
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    PlanTierInfo,
    SubscriptionResponse,
)
from app.repositories.postgres import SqlSubscriptionRepository
from app.services.billing import (
    billing_service,
    get_plan_tier_info,
    get_tier_daily_quota,
    list_all_plan_tiers,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans", response_model=list[PlanTierInfo])
def get_plans():
    """List all available pricing tiers, daily quotas, and capabilities."""
    return list_all_plan_tiers()


@router.get("/subscription", response_model=SubscriptionResponse)
def get_user_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve the active subscription status and daily quota for the current user."""
    sub_repo = SqlSubscriptionRepository(db)
    sub = sub_repo.get_by_user_id(current_user.id)
    tier = sub.plan_tier if sub else "free"
    sub_status = sub.status if sub else "active"
    period_end = sub.current_period_end if sub else None
    quota = get_tier_daily_quota(tier)

    return SubscriptionResponse(
        plan_tier=tier,
        status=sub_status,
        daily_quota=quota,
        current_period_end=period_end,
        is_active=sub_status == "active",
    )


@router.post("/checkout-session", response_model=CheckoutSessionResponse)
def create_checkout_session(
    payload: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
):
    """Initiate a checkout session for upgrading to Pro or Enterprise."""
    try:
        session_info = billing_service.create_checkout_session(
            user_id=current_user.id,
            user_email=current_user.email,
            plan_tier=payload.plan_tier,
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
        )
        return CheckoutSessionResponse(
            checkout_url=session_info["checkout_url"],
            session_id=session_info["session_id"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/cancel", status_code=status.HTTP_200_OK)
def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel an active paid subscription, reverting to Community Free tier."""
    success = billing_service.cancel_subscription(current_user.id, db)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active paid subscription found to cancel",
        )
    return {"status": "canceled", "message": "Reverted to Free tier"}


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
    db: Session = Depends(get_db),
):
    """Stripe webhook receiver for handling subscription updates and lifecycle events."""
    payload = await request.body()
    try:
        result = billing_service.process_webhook_event(payload, stripe_signature, db)
        return {"received": True, "result": result}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error("Stripe webhook handling failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Webhook processing error")
