"""
Comprehensive E2E test suite for:
- Phase 1: Authentication (signup, login, JWT, refresh rotation, replay detection, /me)
- Phase 2: RBAC (User vs Admin permissions, audit logging)
- Phase 3: Admin Control Center (user management, dynamic regex rules, telemetry, models)
- Phase 4: User Platform (history, daily quotas, personal API keys)
"""
import pytest
from fastapi.testclient import TestClient


def test_auth_full_lifecycle(client: TestClient):
    # 1. Signup first user (becomes admin)
    signup_resp = client.post(
        "/api/v1/auth/signup",
        json={"email": "admin@example.com", "password": "supersecretpassword", "full_name": "Admin User"},
    )
    assert signup_resp.status_code == 201
    admin_data = signup_resp.json()
    assert admin_data["email"] == "admin@example.com"
    assert admin_data["role"] == "admin"

    # 2. Duplicate signup rejected
    dup_resp = client.post(
        "/api/v1/auth/signup",
        json={"email": "admin@example.com", "password": "password123"},
    )
    assert dup_resp.status_code == 400
    assert "already registered" in dup_resp.json()["detail"]

    # 3. Login with wrong password rejected
    wrong_pw_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "wrongpassword"},
    )
    assert wrong_pw_resp.status_code == 401

    # 4. Login with correct password
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "supersecretpassword"},
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    # 5. GET /api/v1/auth/me with Bearer token
    me_resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["email"] == "admin@example.com"
    assert me_data["role"] == "admin"

    # 6. Refresh token rotation: exchange old refresh token for new pair
    refresh_resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_resp.status_code == 200
    new_tokens = refresh_resp.json()
    new_access_token = new_tokens["access_token"]
    new_refresh_token = new_tokens["refresh_token"]
    assert new_access_token != access_token
    assert new_refresh_token != refresh_token

    # 7. Replay protection: attempting to reuse old refresh token must be rejected
    replay_resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert replay_resp.status_code == 401
    assert "revoked or replayed" in replay_resp.json()["detail"]


def test_rbac_and_admin_controls(client: TestClient):
    # Create regular user
    client.post(
        "/api/v1/auth/signup",
        json={"email": "user1@example.com", "password": "password123", "full_name": "Normal User"},
    )
    user_login = client.post(
        "/api/v1/auth/login",
        json={"email": "user1@example.com", "password": "password123"},
    )
    user_token = user_login.json()["access_token"]

    # Create admin user
    client.post(
        "/api/v1/auth/signup",
        json={"email": "superadmin@example.com", "password": "password123", "full_name": "Super Admin"},
    )
    # Give superadmin the admin role directly
    from app.db.models import User
    from app.db.session import SessionLocal
    db = SessionLocal()
    u = db.query(User).filter(User.email == "superadmin@example.com").first()
    u.role = "admin"
    db.commit()
    db.close()

    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": "superadmin@example.com", "password": "password123"},
    )
    admin_token = admin_login.json()["access_token"]

    # 1. Normal user forbidden from Admin endpoints (403)
    user_forbidden_resp = client.get(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert user_forbidden_resp.status_code == 403

    # 2. Admin can list users (200)
    admin_users_resp = client.get(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_users_resp.status_code == 200
    assert admin_users_resp.json()["total"] >= 2

    # 3. Admin can patch user (e.g. promote to admin)
    target_user = [u for u in admin_users_resp.json()["users"] if u["email"] == "user1@example.com"][0]
    patch_resp = client.patch(
        f"/api/v1/admin/users/{target_user['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"role": "admin"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["role"] == "admin"

    # 4. Action recorded in audit logs
    audit_resp = client.get(
        "/api/v1/admin/audit-logs",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert audit_resp.status_code == 200
    logs = audit_resp.json()["audit_logs"]
    assert any(log["action"] == "USER_UPDATE" for log in logs)

    # 5. Dynamic regex rule creation and hot-reloading
    rule_create_resp = client.post(
        "/api/v1/admin/regex-rules",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "label": "critical_database_failure",
            "pattern": r"deadlock detected on transaction \d+",
            "description": "Database engine deadlock alert",
        },
    )
    assert rule_create_resp.status_code == 201
    rule_id = rule_create_resp.json()["id"]

    # Test that newly registered rule immediately matches live logs!
    classify_resp = client.post(
        "/api/v1/classify",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"text": "Postgres: deadlock detected on transaction 98451"},
    )
    assert classify_resp.status_code == 200
    assert classify_resp.json()["label"] == "critical_database_failure"
    assert classify_resp.json()["method_used"] == "regex"

    # Delete rule
    del_resp = client.delete(
        f"/api/v1/admin/regex-rules/{rule_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert del_resp.status_code == 200


def test_user_platform_personal_api_keys_and_quota(client: TestClient):
    # Signup a regular platform user
    client.post(
        "/api/v1/auth/signup",
        json={"email": "developer@example.com", "password": "password123", "full_name": "Dev User"},
    )
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "developer@example.com", "password": "password123"},
    )
    user_token = login_resp.json()["access_token"]
    user_headers = {"Authorization": f"Bearer {user_token}"}

    # 1. Generate personal API key
    key_resp = client.post(
        "/api/v1/api-keys",
        headers=user_headers,
        json={"label": "Microservice CI Pipeline"},
    )
    assert key_resp.status_code == 201
    key_data = key_resp.json()
    assert "raw_key" in key_data
    raw_api_key = key_data["raw_key"]
    api_key_id = key_data["id"]

    # 2. Authenticate /classify using personal API key via X-API-Key
    classify_with_key_resp = client.post(
        "/api/v1/classify",
        headers={"X-API-Key": raw_api_key},
        json={"text": "multiple login failures detected from 10.0.0.1"},
    )
    assert classify_with_key_resp.status_code == 200
    assert classify_with_key_resp.json()["label"] == "security_alert"

    # 3. Check personal history
    history_resp = client.get("/api/v1/history", headers=user_headers)
    assert history_resp.status_code == 200
    items = history_resp.json()["items"]
    assert len(items) >= 1
    assert items[0]["text"] == "multiple login failures detected from 10.0.0.1"

    # 4. Check quota status
    quota_resp = client.get("/api/v1/quota", headers=user_headers)
    assert quota_resp.status_code == 200
    assert quota_resp.json()["today_count"] >= 1
    assert quota_resp.json()["remaining"] <= quota_resp.json()["daily_limit"] - 1

    # 5. Revoke API key
    revoke_resp = client.delete(f"/api/v1/api-keys/{api_key_id}", headers=user_headers)
    assert revoke_resp.status_code == 200

    # Key should no longer work
    revoked_key_attempt = client.post(
        "/api/v1/classify",
        headers={"X-API-Key": raw_api_key},
        json={"text": "test log"},
    )
    assert revoked_key_attempt.status_code == 401
