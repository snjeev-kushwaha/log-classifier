"""
End-to-End tests for Phase 5: OAuth2 Social Login and Account Linking.

Verifies:
1. New OAuth login creates a user with no password set (hashed_password is None).
2. OAuth login with an email matching an existing password account links correctly
   without creating duplicate users, while preserving existing passwords.
3. User can continue logging in via both password and OAuth after linking.
4. Token issuance and authorization code callback flows integrate seamlessly.
"""
import uuid
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import func

from app.db.models import AuditLog, User
from app.db.session import SessionLocal


def test_oauth_new_user_creation_without_password(client: TestClient):
    """
    Verifies that a brand-new OAuth login creates a user record with:
    - hashed_password is None
    - oauth_provider and oauth_subject_id populated
    - is_verified=True
    - Valid JWT access & refresh token pair returned
    - Password login is rejected
    """
    unique_id = uuid.uuid4().hex[:8]
    test_email = f"fresh_oauth_{unique_id}@example.com"
    oauth_payload = {
        "provider": "google",
        "subject_id": f"google-sub-{unique_id}",
        "email": test_email,
        "full_name": "Google First Time User",
    }

    # 1. Direct OAuth token login
    resp = client.post("/api/v1/auth/oauth/token-login", json=oauth_payload)
    assert resp.status_code == 200, resp.text
    tokens = resp.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    assert tokens["token_type"] == "bearer"

    # 2. Access profile via /me
    me_resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["email"] == test_email
    assert me_data["full_name"] == "Google First Time User"
    assert me_data["is_verified"] is True
    assert me_data["oauth_provider"] == "google"

    # 3. Verify in database: hashed_password MUST be None
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == test_email).first()
        assert user is not None
        assert user.hashed_password is None
        assert user.oauth_provider == "google"
        assert user.oauth_subject_id == f"google-sub-{unique_id}"
    finally:
        db.close()

    # 4. Verify password login is rejected since user has no password
    pwd_login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": test_email, "password": "anypassword123"},
    )
    assert pwd_login_resp.status_code == 401

    # 5. Verify refresh token rotation works for OAuth user
    refresh_resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert refresh_resp.status_code == 200
    new_tokens = refresh_resp.json()
    assert "access_token" in new_tokens
    assert new_tokens["access_token"] != tokens["access_token"]


def test_oauth_account_linking_with_existing_password_user(client: TestClient):
    """
    Verifies the account linking policy:
    1. User registers first via standard email + password.
    2. User later logs in via Google OAuth with the exact same email.
    3. The system links the OAuth provider & subject_id to the existing user.
    4. NO duplicate user is created.
    5. The existing hashed password is preserved so password login still works.
    """
    unique_id = uuid.uuid4().hex[:8]
    test_email = f"linkme_{unique_id}@example.com"
    original_password = "SecretPassword!123"

    # 1. Signup user via password
    signup_resp = client.post(
        "/api/v1/auth/signup",
        json={"email": test_email, "password": original_password, "full_name": "Original Name"},
    )
    assert signup_resp.status_code == 201

    db = SessionLocal()
    try:
        user_before = db.query(User).filter(User.email == test_email).first()
        assert user_before is not None
        original_user_id = user_before.id
        original_hash = user_before.hashed_password
        assert original_hash is not None
        assert user_before.oauth_provider is None
    finally:
        db.close()

    # 2. Login via OAuth with the same email
    oauth_payload = {
        "provider": "google",
        "subject_id": f"google-linked-id-{unique_id}",
        "email": test_email,
        "full_name": "Original Name",
    }
    oauth_resp = client.post("/api/v1/auth/oauth/token-login", json=oauth_payload)
    assert oauth_resp.status_code == 200
    oauth_tokens = oauth_resp.json()
    assert "access_token" in oauth_tokens

    # 3. Check DB: exactly ONE user exists, with linked OAuth info and preserved password
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.email == test_email).all()
        assert len(users) == 1, "Account linking must not create duplicate user records"

        linked_user = users[0]
        assert linked_user.id == original_user_id
        assert linked_user.hashed_password == original_hash, "Password hash must be preserved"
        assert linked_user.oauth_provider == "google"
        assert linked_user.oauth_subject_id == f"google-linked-id-{unique_id}"
        assert linked_user.is_verified is True

        # Check audit log for OAUTH_ACCOUNT_LINKED
        audit = (
            db.query(AuditLog)
            .filter(AuditLog.target == f"user:{original_user_id}", AuditLog.action == "OAUTH_ACCOUNT_LINKED")
            .first()
        )
        assert audit is not None
    finally:
        db.close()

    # 4. Verify password login still works seamlessly
    pwd_login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": test_email, "password": original_password},
    )
    assert pwd_login_resp.status_code == 200
    pwd_tokens = pwd_login_resp.json()
    assert "access_token" in pwd_tokens

    # 5. Subsequent OAuth login with same provider & subject_id succeeds
    repeat_oauth_resp = client.post("/api/v1/auth/oauth/token-login", json=oauth_payload)
    assert repeat_oauth_resp.status_code == 200


def test_oauth_routes_validation_and_callback_flow(client: TestClient):
    """
    Tests input validation on OAuth endpoints and tests the callback redirect
    behavior by mocking the OAuth client token exchange.
    """
    # 1. Unsupported provider is rejected
    unsupported_resp = client.get("/api/v1/auth/oauth/unknown_provider/authorize")
    assert unsupported_resp.status_code == 400

    unsupported_cb_resp = client.get("/api/v1/auth/oauth/unknown_provider/callback")
    assert unsupported_cb_resp.status_code == 400

    # 2. Mock OAuth callback flow
    from app.core.oauth import oauth

    unique_id = uuid.uuid4().hex[:8]
    cb_email = f"callback_user_{unique_id}@example.com"
    mock_client = AsyncMock()
    mock_client.authorize_access_token.return_value = {
        "userinfo": {
            "sub": f"mock-google-callback-{unique_id}",
            "email": cb_email,
            "name": "Callback User",
        }
    }

    with patch.object(oauth, "create_client", return_value=mock_client):
        cb_resp = client.get(
            "/api/v1/auth/oauth/google/callback",
            follow_redirects=False,
        )
        # Should redirect to frontend origin with tokens in query string
        assert cb_resp.status_code in (302, 307)
        location = cb_resp.headers.get("location", "")
        assert "oauth_token=" in location
        assert "refresh_token=" in location

        # Verify user was created in DB
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == cb_email).first()
            assert user is not None
            assert user.oauth_provider == "google"
            assert user.oauth_subject_id == f"mock-google-callback-{unique_id}"
        finally:
            db.close()
