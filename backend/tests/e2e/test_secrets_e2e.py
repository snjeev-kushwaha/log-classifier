"""
End-to-End tests for Phase 6:
1. Secrets Management & Zero-Downtime JWT Secret Rotation.
2. PostgreSQL-only Database Status and Metrics.
3. Server-side session continuity through refresh tokens during secret rotation.
"""
import uuid
from fastapi.testclient import TestClient

from app.core.secrets import secrets_manager
from app.db.models import AuditLog, User
from app.db.session import SessionLocal


def test_secrets_manager_and_jwt_secret_rotation(client: TestClient):
    """
    Verifies that:
    1. An admin can trigger JWT secret rotation.
    2. The secrets manager preserves the previous key for dual-key grace decoding.
    3. Existing user sessions can refresh via /auth/refresh without logging out,
       because refresh tokens are stored server-side in PostgreSQL.
    """
    unique_id = uuid.uuid4().hex[:8]
    admin_email = f"admin_rot_{unique_id}@example.com"
    user_email = f"user_rot_{unique_id}@example.com"

    # 1. Setup admin and standard user
    client.post(
        "/api/v1/auth/signup",
        json={"email": admin_email, "password": "AdminPassword123!", "full_name": "Admin Rotator"},
    )
    client.post(
        "/api/v1/auth/signup",
        json={"email": user_email, "password": "UserPassword123!", "full_name": "Active User"},
    )

    db = SessionLocal()
    try:
        u_admin = db.query(User).filter(User.email == admin_email).first()
        u_admin.role = "admin"
        u_user = db.query(User).filter(User.email == user_email).first()
        u_user.role = "user"
        db.commit()
    finally:
        db.close()

    # Login admin
    admin_login = client.post("/api/v1/auth/login", json={"email": admin_email, "password": "AdminPassword123!"})
    admin_token = admin_login.json()["access_token"]

    # Login regular user
    user_login = client.post("/api/v1/auth/login", json={"email": user_email, "password": "UserPassword123!"})
    user_tokens = user_login.json()
    user_access_token_v1 = user_tokens["access_token"]
    user_refresh_token = user_tokens["refresh_token"]

    # Verify user can access /me with initial token
    me_resp1 = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {user_access_token_v1}"})
    assert me_resp1.status_code == 200

    # 2. Check initial secrets status
    status_resp = client.get("/api/v1/admin/secrets/status", headers={"Authorization": f"Bearer {admin_token}"})
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert "backend" in status_data

    # 3. Admin rotates JWT Secret
    rotate_resp = client.post("/api/v1/admin/secrets/rotate-jwt", headers={"Authorization": f"Bearer {admin_token}"})
    assert rotate_resp.status_code == 200
    rotate_data = rotate_resp.json()
    assert rotate_data["status"] == "rotated"
    assert rotate_data["secrets_status"]["jwt_previous_retained"] is True

    # 4. Old access token continues to work during dual-key grace period
    me_resp2 = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {user_access_token_v1}"})
    assert me_resp2.status_code == 200

    # 5. User refreshes session via server-side refresh token
    refresh_resp = client.post("/api/v1/auth/refresh", json={"refresh_token": user_refresh_token})
    assert refresh_resp.status_code == 200
    new_tokens = refresh_resp.json()
    user_access_token_v2 = new_tokens["access_token"]
    assert user_access_token_v2 != user_access_token_v1

    # New token works seamlessly
    me_resp3 = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {user_access_token_v2}"})
    assert me_resp3.status_code == 200

    # 6. Verify audit log recorded rotation
    db = SessionLocal()
    try:
        audit = (
            db.query(AuditLog)
            .filter(AuditLog.action == "JWT_SECRET_ROTATED")
            .order_by(AuditLog.created_at.desc())
            .first()
        )
        assert audit is not None
    finally:
        db.close()


def test_admin_database_status_endpoint(client: TestClient):
    """Verifies that the /admin/database/status endpoint reports PostgreSQL-only metrics."""
    unique_id = uuid.uuid4().hex[:8]
    admin_email = f"db_admin_{unique_id}@example.com"

    client.post(
        "/api/v1/auth/signup",
        json={"email": admin_email, "password": "AdminPassword123!", "full_name": "DB Admin"},
    )
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == admin_email).first()
        u.role = "admin"
        db.commit()
    finally:
        db.close()

    admin_login = client.post("/api/v1/auth/login", json={"email": admin_email, "password": "AdminPassword123!"})
    admin_token = admin_login.json()["access_token"]

    resp = client.get("/api/v1/admin/database/status", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["database"] == "PostgreSQL"
    assert data["status"] == "connected"
    assert "metrics" in data
    assert data["metrics"]["total_users"] >= 1
