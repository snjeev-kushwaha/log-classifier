"""
Comprehensive End-to-End Test Suite for Phase 7: Product Hardening for Real Users
Verifies:
1. Email verification & password reset flows
2. In-app notifications (creation, read state, batch completion trigger)
3. Billing & plan tiers (Stripe checkout sessions, webhook tier upgrade, quota adjustment, cancellation)
4. GDPR compliance (data export and right-to-erasure account deletion)
5. Full observability (/metrics Prometheus format and /admin/observability/stats dashboard data)
"""
import io
import json
import uuid
import pytest
from starlette.testclient import TestClient

from app.core.config import settings
from app.db.models import ClassificationRecord, User
from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.repositories.postgres import SqlUserRepository
from app.services.email import email_service


@pytest.fixture(scope="module", autouse=True)
def init_db():
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    return TestClient(app)


def test_email_verification_and_password_reset_flow(client: TestClient):
    # 1. Register new user
    uid = uuid.uuid4().hex[:8]
    email = f"verify_{uid}@example.com"
    password = "InitialPassword123!"
    res = client.post("/api/v1/auth/signup", json={"email": email, "password": password, "full_name": "Verify User"})
    assert res.status_code == 201
    user_data = res.json()
    assert user_data["is_verified"] is False

    # Check that verification email was dispatched
    last_email = email_service.sent_emails[-1]
    assert last_email["to"] == email
    assert last_email["metadata"]["type"] == "verify_email"
    verify_token = last_email["metadata"]["token"]

    # 2. Confirm verification with token
    res = client.post("/api/v1/auth/verify-email/confirm", json={"token": verify_token})
    assert res.status_code == 200
    assert res.json()["status"] == "verified"

    # Token cannot be re-used
    res = client.post("/api/v1/auth/verify-email/confirm", json={"token": verify_token})
    assert res.status_code == 400

    # 3. Request password reset
    res = client.post("/api/v1/auth/password-reset/request", json={"email": email})
    assert res.status_code == 200

    last_email = email_service.sent_emails[-1]
    assert last_email["to"] == email
    assert last_email["metadata"]["type"] == "password_reset"
    reset_token = last_email["metadata"]["token"]

    # 4. Confirm password reset with new password
    new_password = "UpdatedPassword456!"
    res = client.post("/api/v1/auth/password-reset/confirm", json={"token": reset_token, "new_password": new_password})
    assert res.status_code == 200
    assert res.json()["status"] == "password_reset"

    # Old password should fail login
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 401

    # New password should succeed
    res = client.post("/api/v1/auth/login", json={"email": email, "password": new_password})
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_notifications_and_batch_processing_trigger(client: TestClient):
    # Register and login user
    uid = uuid.uuid4().hex[:8]
    email = f"notif_{uid}@example.com"
    pwd = "NotifPassword123!"
    client.post("/api/v1/auth/signup", json={"email": email, "password": pwd, "full_name": "Notif User"})
    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    token = login_res.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # Initial notifications list
    res = client.get("/api/v1/notifications", headers=auth_headers)
    assert res.status_code == 200
    initial_total = res.json()["total"]

    # Run a batch classification as authenticated user
    csv_content = "log_message\nSystem reboot initiated by user\nConnection timeout on port 8080\n"
    res = client.post(
        "/api/v1/classify/batch",
        files={"file": ("test_logs.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
        headers=auth_headers,
    )
    assert res.status_code == 200

    # Notifications should now include batch completion
    res = client.get("/api/v1/notifications", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == initial_total + 1
    assert data["unread_count"] >= 1
    notif = data["items"][0]
    assert notif["type"] == "batch_completed"
    assert notif["is_read"] is False

    # Mark single notification as read
    res = client.patch(f"/api/v1/notifications/{notif['id']}/read", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "read"

    # Mark all as read
    res = client.post("/api/v1/notifications/mark-all-read", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "all_marked_read"


def test_billing_plans_stripe_webhook_and_quota_upgrade(client: TestClient):
    uid = uuid.uuid4().hex[:8]
    email = f"billing_{uid}@example.com"
    pwd = "BillingPassword123!"
    signup_res = client.post("/api/v1/auth/signup", json={"email": email, "password": pwd, "full_name": "Billing User"})
    user_id = signup_res.json()["id"]

    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    token = login_res.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # 1. List available plans
    plans_res = client.get("/api/v1/billing/plans")
    assert plans_res.status_code == 200
    plans = plans_res.json()
    tier_names = [p["tier"] for p in plans]
    assert "free" in tier_names
    assert "pro" in tier_names
    assert "enterprise" in tier_names

    # 2. Check initial default free subscription
    sub_res = client.get("/api/v1/billing/subscription", headers=auth_headers)
    assert sub_res.status_code == 200
    assert sub_res.json()["plan_tier"] == "free"
    assert sub_res.json()["daily_quota"] == 100

    # Check user quota endpoint
    quota_res = client.get("/api/v1/quota", headers=auth_headers)
    assert quota_res.status_code == 200
    assert quota_res.json()["daily_limit"] == 100

    # 3. Create checkout session for Pro
    checkout_res = client.post(
        "/api/v1/billing/checkout-session",
        json={"plan_tier": "pro"},
        headers=auth_headers,
    )
    assert checkout_res.status_code == 200
    assert "checkout_url" in checkout_res.json()

    # 4. Simulate Stripe webhook for completed checkout session
    webhook_payload = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "customer": "cus_test_123",
                "subscription": "sub_test_123",
                "metadata": {
                    "user_id": str(user_id),
                    "plan_tier": "pro",
                },
            },
        },
    }
    webhook_res = client.post(
        "/api/v1/billing/webhook",
        content=json.dumps(webhook_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    assert webhook_res.status_code == 200
    assert webhook_res.json()["received"] is True

    # Check updated subscription and upgraded quota (5,000 for Pro)
    sub_res = client.get("/api/v1/billing/subscription", headers=auth_headers)
    assert sub_res.status_code == 200
    assert sub_res.json()["plan_tier"] == "pro"
    assert sub_res.json()["daily_quota"] == 5000

    quota_res = client.get("/api/v1/quota", headers=auth_headers)
    assert quota_res.status_code == 200
    assert quota_res.json()["daily_limit"] == 5000

    # 5. Cancel subscription reverts back to free
    cancel_res = client.post("/api/v1/billing/cancel", headers=auth_headers)
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "canceled"

    sub_res = client.get("/api/v1/billing/subscription", headers=auth_headers)
    assert sub_res.json()["plan_tier"] == "free"
    assert sub_res.json()["daily_quota"] == 100


def test_gdpr_data_export_and_account_erasure(client: TestClient):
    uid = uuid.uuid4().hex[:8]
    email = f"gdpr_{uid}@example.com"
    pwd = "GdprPassword123!"
    client.post("/api/v1/auth/signup", json={"email": email, "password": pwd, "full_name": "GDPR User"})
    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    token = login_res.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # Generate a classification record and API key
    client.post("/api/v1/classify", json={"text": "Disk space critically low on /var/log"}, headers=auth_headers)
    client.post("/api/v1/api-keys", json={"label": "GDPR Key"}, headers=auth_headers)

    # 1. GDPR Export
    export_res = client.get("/api/v1/account/export-data", headers=auth_headers)
    assert export_res.status_code == 200
    data = export_res.json()
    assert data["user_profile"]["email"] == email
    assert len(data["classification_history"]) >= 1
    assert len(data["api_keys"]) >= 1

    # 2. Right to erasure without confirmation fails
    del_res = client.request(
        "DELETE",
        "/api/v1/account/delete-my-account",
        json={"password": pwd, "confirmation": "WRONG_TEXT"},
        headers=auth_headers,
    )
    assert del_res.status_code == 400

    # Right to erasure with bad password fails
    del_res = client.request(
        "DELETE",
        "/api/v1/account/delete-my-account",
        json={"password": "WrongPassword", "confirmation": "DELETE MY ACCOUNT"},
        headers=auth_headers,
    )
    assert del_res.status_code == 401

    # Successful deletion
    del_res = client.request(
        "DELETE",
        "/api/v1/account/delete-my-account",
        json={"password": pwd, "confirmation": "DELETE MY ACCOUNT"},
        headers=auth_headers,
    )
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Login should now fail because account no longer exists
    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    assert login_res.status_code == 401


def test_observability_endpoint_and_prometheus_metrics(client: TestClient):
    # Fetch admin credentials
    db = SessionLocal()
    admin = db.query(User).filter(User.role == "admin").first()
    db.close()
    assert admin is not None

    from app.core.security import create_access_token
    from datetime import timedelta
    admin_token = create_access_token(admin.id, {"email": admin.email, "role": "admin"}, timedelta(minutes=15))
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Test /admin/observability/stats endpoint
    obs_res = client.get("/api/v1/admin/observability/stats", headers=admin_headers)
    assert obs_res.status_code == 200
    stats = obs_res.json()
    assert "requests_by_role" in stats
    assert "classifications_by_tier" in stats
    assert "auth_events_summary" in stats
    assert stats["system_health"]["database"] == "PostgreSQL"

    # 2. Test /metrics Prometheus exposition
    metrics_res = client.get("/metrics")
    assert metrics_res.status_code == 200
    assert "log_classifier" in metrics_res.text
