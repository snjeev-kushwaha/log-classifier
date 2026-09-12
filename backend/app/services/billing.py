"""
Billing and subscription service with Stripe integration and local tier fallback.
"""
from datetime import datetime, timedelta, timezone
import json
import logging
from typing import Any, Optional

import stripe
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.schemas import PlanTierInfo
from app.repositories.postgres import SqlNotificationRepository, SqlSubscriptionRepository

logger = logging.getLogger(__name__)

# Plan tier definitions & quotas
PLAN_TIERS: dict[str, dict[str, Any]] = {
    "free": {
        "tier": "free",
        "name": "Community Free",
        "price_usd": 0,
        "daily_quota": 100,
        "features": [
            "100 log classifications / day",
            "Deterministic Regex + BERT ML pipeline",
            "Community Slack & Github support",
        ],
    },
    "pro": {
        "tier": "pro",
        "name": "Professional Tier",
        "price_usd": 29,
        "daily_quota": 5000,
        "features": [
            "5,000 log classifications / day",
            "Priority Groq LLM fallback reasoning",
            "CSV Batch upload processing (up to 5,000 rows/batch)",
            "Personal API Keys & Webhooks",
        ],
    },
    "enterprise": {
        "tier": "enterprise",
        "name": "Enterprise Scale",
        "price_usd": 199,
        "daily_quota": 50000,
        "features": [
            "50,000 log classifications / day",
            "Dedicated high-throughput LLM rate limits",
            "Custom dynamic regex rule authoring",
            "Audit log export & GDPR compliance tools",
            "24/7 dedicated support SLA",
        ],
    },
}


def get_plan_tier_info(tier: str) -> PlanTierInfo:
    plan = PLAN_TIERS.get(tier.lower(), PLAN_TIERS["free"])
    return PlanTierInfo(
        tier=plan["tier"],
        name=plan["name"],
        price_usd=plan["price_usd"],
        daily_quota=plan["daily_quota"],
        features=plan["features"],
    )


def list_all_plan_tiers() -> list[PlanTierInfo]:
    return [get_plan_tier_info(t) for t in PLAN_TIERS.keys()]


def get_tier_daily_quota(tier: Optional[str]) -> int:
    if not tier:
        return PLAN_TIERS["free"]["daily_quota"]
    plan = PLAN_TIERS.get(tier.lower())
    return plan["daily_quota"] if plan else PLAN_TIERS["free"]["daily_quota"]


class BillingService:
    def __init__(self):
        if settings.stripe_secret_key:
            stripe.api_key = settings.stripe_secret_key

    def create_checkout_session(
        self,
        user_id: int,
        user_email: str,
        plan_tier: str,
        success_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
    ) -> dict[str, str]:
        plan_key = plan_tier.lower()
        if plan_key not in ("pro", "enterprise"):
            raise ValueError(f"Invalid plan tier for checkout: {plan_tier}. Choose 'pro' or 'enterprise'.")

        default_success = f"{settings.frontend_origin.rstrip('/')}?checkout=success&tier={plan_key}"
        default_cancel = f"{settings.frontend_origin.rstrip('/')}?checkout=cancel"
        final_success = success_url or default_success
        final_cancel = cancel_url or default_cancel

        if settings.stripe_secret_key:
            try:
                price_id = settings.stripe_price_pro if plan_key == "pro" else settings.stripe_price_enterprise
                session = stripe.checkout.Session.create(
                    payment_method_types=["card"],
                    line_items=[{"price": price_id, "quantity": 1}],
                    mode="subscription",
                    success_url=final_success,
                    cancel_url=final_cancel,
                    customer_email=user_email,
                    metadata={"user_id": str(user_id), "plan_tier": plan_key},
                )
                return {"checkout_url": session.url, "session_id": session.id}
            except Exception as e:
                logger.error("Stripe checkout creation failed: %s", e)
                raise RuntimeError(f"Could not initiate Stripe checkout: {e}") from e
        else:
            # Simulated Stripe checkout session for testing/dev environments
            simulated_id = f"cs_simulated_{user_id}_{plan_key}_{int(datetime.now(timezone.utc).timestamp())}"
            simulated_url = f"{final_success}&session_id={simulated_id}"
            return {"checkout_url": simulated_url, "session_id": simulated_id}

    def process_webhook_event(self, payload: bytes, sig_header: Optional[str], db: Session) -> dict[str, Any]:
        sub_repo = SqlSubscriptionRepository(db)
        notif_repo = SqlNotificationRepository(db)

        if settings.stripe_secret_key and settings.stripe_webhook_secret and sig_header:
            try:
                event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
            except Exception as e:
                logger.error("Stripe webhook verification error: %s", e)
                raise ValueError(f"Invalid webhook signature: {e}") from e
        else:
            # Parse raw JSON in dev/testing
            event = json.loads(payload.decode("utf-8"))

        event_type = event.get("type", "")
        data_obj = event.get("data", {}).get("object", {})

        if event_type == "checkout.session.completed":
            metadata = data_obj.get("metadata", {})
            user_id_str = metadata.get("user_id")
            plan_tier = metadata.get("plan_tier", "pro")
            customer_id = data_obj.get("customer")
            sub_id = data_obj.get("subscription")

            if user_id_str:
                user_id = int(user_id_str)
                period_end = datetime.now(timezone.utc) + timedelta(days=30)
                sub_repo.create_or_update(
                    user_id=user_id,
                    plan_tier=plan_tier,
                    status="active",
                    stripe_customer_id=customer_id,
                    stripe_subscription_id=sub_id,
                    current_period_end=period_end,
                )
                notif_repo.create(
                    user_id=user_id,
                    title="Subscription Activated!",
                    message=f"You have upgraded to {plan_tier.upper()} tier with {get_tier_daily_quota(plan_tier):,} classifications per day.",
                    type="billing",
                )
                logger.info("Activated %s subscription for user %s", plan_tier, user_id)
                return {"status": "activated", "user_id": user_id, "plan_tier": plan_tier}

        elif event_type in ("customer.subscription.deleted", "customer.subscription.updated"):
            sub_id = data_obj.get("id")
            sub_status = data_obj.get("status", "canceled")
            metadata = data_obj.get("metadata", {})
            user_id_str = metadata.get("user_id")
            if user_id_str:
                user_id = int(user_id_str)
                new_tier = "free" if sub_status in ("canceled", "unpaid") else metadata.get("plan_tier", "pro")
                sub_repo.create_or_update(
                    user_id=user_id,
                    plan_tier=new_tier,
                    status=sub_status,
                )
                notif_repo.create(
                    user_id=user_id,
                    title="Subscription Status Updated",
                    message=f"Your subscription is now {sub_status}. Current plan: {new_tier}.",
                    type="billing",
                )
                return {"status": "updated", "user_id": user_id, "new_tier": new_tier}

        return {"status": "unhandled_event", "type": event_type}

    def cancel_subscription(self, user_id: int, db: Session) -> bool:
        sub_repo = SqlSubscriptionRepository(db)
        notif_repo = SqlNotificationRepository(db)
        sub = sub_repo.get_by_user_id(user_id)
        if not sub or sub.plan_tier == "free":
            return False

        if sub.stripe_subscription_id and settings.stripe_secret_key:
            try:
                stripe.Subscription.delete(sub.stripe_subscription_id)
            except Exception as e:
                logger.warning("Could not delete subscription on Stripe: %s", e)

        sub_repo.create_or_update(
            user_id=user_id,
            plan_tier="free",
            status="canceled",
        )
        notif_repo.create(
            user_id=user_id,
            title="Subscription Canceled",
            message="Your plan has been reverted to Community Free tier (100 classifications/day).",
            type="billing",
        )
        return True


billing_service = BillingService()
