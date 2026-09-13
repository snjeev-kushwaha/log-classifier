"""
Bootstrap service for initializing required system records on application startup.
Ensures the default root administrator specified in configuration (.env) is provisioned.
"""
import logging

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.db.models import User
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)


def ensure_root_admin() -> None:
    """
    Ensures that the default root administrator account configured in settings (.env)
    is created, active, verified, has the 'admin' role, and that the password matches
    the current configuration.
    """
    if not settings.root_user_email or not settings.root_user_password:
        return

    db = SessionLocal()
    try:
        email = settings.root_user_email.lower().strip()
        user = db.query(User).filter(User.email == email).first()

        if not user:
            user = User(
                email=email,
                hashed_password=hash_password(settings.root_user_password),
                full_name=settings.root_user_name,
                role="admin",
                is_active=True,
                is_verified=True,
            )
            db.add(user)
            db.commit()
            logger.info("Default root administrator created successfully", extra={"email": email, "role": "admin"})
        else:
            changed = False
            if user.role != "admin":
                user.role = "admin"
                changed = True
            if not user.is_active:
                user.is_active = True
                changed = True
            if not user.is_verified:
                user.is_verified = True
                changed = True
            if user.full_name != settings.root_user_name:
                user.full_name = settings.root_user_name
                changed = True
            if not user.hashed_password or not verify_password(settings.root_user_password, user.hashed_password):
                user.hashed_password = hash_password(settings.root_user_password)
                changed = True

            if changed:
                db.commit()
                logger.info("Default root administrator synchronized from environment", extra={"email": email})
    except Exception as exc:
        db.rollback()
        logger.error("Failed to ensure default root administrator: %s", exc)
    finally:
        db.close()
