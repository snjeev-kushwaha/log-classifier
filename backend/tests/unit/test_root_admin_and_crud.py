"""
Unit & integration tests for root admin user provisioning and admin user CRUD.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.models import User
from app.db.session import Base, get_db
from app.main import app
from app.services.bootstrap import ensure_root_admin


@pytest.fixture
def isolated_client():
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Provision root admin in test DB
    db = TestingSessionLocal()
    from app.core.security import hash_password
    root_u = User(
        email=settings.root_user_email.lower().strip(),
        hashed_password=hash_password(settings.root_user_password),
        full_name=settings.root_user_name,
        role="admin",
        is_active=True,
        is_verified=True,
    )
    db.add(root_u)
    db.commit()
    db.close()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_root_user_login_with_email_and_username(isolated_client: TestClient):
    # 1. Login with root email
    res1 = isolated_client.post(
        "/api/v1/auth/login",
        json={"email": settings.root_user_email, "password": settings.root_user_password},
    )
    assert res1.status_code == 200
    tokens = res1.json()
    assert "access_token" in tokens

    # 2. Login with root username ('root')
    res2 = isolated_client.post(
        "/api/v1/auth/login",
        json={"email": settings.root_user_username, "password": settings.root_user_password},
    )
    assert res2.status_code == 200
    assert "access_token" in res2.json()

    # 3. Verify admin profile via /me
    token = res2.json()["access_token"]
    me_res = isolated_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_res.status_code == 200
    assert me_res.json()["role"] == "admin"
    assert me_res.json()["email"] == settings.root_user_email


def test_admin_user_crud_operations(isolated_client: TestClient):
    # Authenticate as root admin
    login_res = isolated_client.post(
        "/api/v1/auth/login",
        json={"email": settings.root_user_username, "password": settings.root_user_password},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    auth_header = {"Authorization": f"Bearer {token}"}

    # 1. CREATE user (POST /api/v1/admin/users)
    create_res = isolated_client.post(
        "/api/v1/admin/users",
        headers=auth_header,
        json={
            "email": "developer@enterprise.com",
            "password": "SecurePassword123!",
            "full_name": "Developer Jane",
            "role": "user",
            "is_active": True,
        },
    )
    assert create_res.status_code == 201
    created_data = create_res.json()
    user_id = created_data["id"]
    assert created_data["email"] == "developer@enterprise.com"
    assert created_data["role"] == "user"
    assert created_data["is_active"] is True

    # Duplicate create fails
    dup_res = isolated_client.post(
        "/api/v1/admin/users",
        headers=auth_header,
        json={
            "email": "developer@enterprise.com",
            "password": "SecurePassword123!",
        },
    )
    assert dup_res.status_code == 400

    # 2. READ users (GET /api/v1/admin/users)
    list_res = isolated_client.get("/api/v1/admin/users", headers=auth_header)
    assert list_res.status_code == 200
    users_list = list_res.json()["users"]
    assert any(u["id"] == user_id for u in users_list)

    # 3. UPDATE user (PATCH /api/v1/admin/users/{id})
    update_res = isolated_client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=auth_header,
        json={"role": "admin", "is_active": False},
    )
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["role"] == "admin"
    assert updated_data["is_active"] is False

    # 4. DELETE user (DELETE /api/v1/admin/users/{id})
    del_res = isolated_client.delete(f"/api/v1/admin/users/{user_id}", headers=auth_header)
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Verify user no longer exists in list
    verify_list = isolated_client.get("/api/v1/admin/users", headers=auth_header)
    assert not any(u["id"] == user_id for u in verify_list.json()["users"])

    # 5. Prevent self-deletion
    root_me = isolated_client.get("/api/v1/auth/me", headers=auth_header).json()
    self_del_res = isolated_client.delete(f"/api/v1/admin/users/{root_me['id']}", headers=auth_header)
    assert self_del_res.status_code == 400
    assert "cannot delete their own account" in self_del_res.json()["detail"]
