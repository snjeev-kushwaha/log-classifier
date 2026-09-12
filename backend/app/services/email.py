"""
Email delivery service supporting verification and password reset flows.
Provides simulated delivery (development/testing) and SMTP delivery (production).
"""
from datetime import datetime, timezone
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        # In-memory store for verification/reset emails in tests/dev
        self.sent_emails: list[dict[str, Any]] = []

    def send_verification_email(self, email: str, token: str) -> bool:
        verification_link = f"{settings.frontend_origin.rstrip('/')}?verify_token={token}"
        subject = "Verify your email address - Hybrid Log Classifier"
        body_text = (
            f"Welcome to Hybrid Log Classifier!\n\n"
            f"Please verify your email address by visiting the link below:\n"
            f"{verification_link}\n\n"
            f"This link expires in {settings.verification_token_expire_hours} hours."
        )
        return self._send_email(to_email=email, subject=subject, body_text=body_text, metadata={"token": token, "type": "verify_email"})

    def send_password_reset_email(self, email: str, token: str) -> bool:
        reset_link = f"{settings.frontend_origin.rstrip('/')}?reset_token={token}"
        subject = "Reset your password - Hybrid Log Classifier"
        body_text = (
            f"A password reset was requested for your account.\n\n"
            f"Click the link below to set a new password:\n"
            f"{reset_link}\n\n"
            f"If you did not request this, please ignore this email.\n"
            f"This link expires in {settings.password_reset_token_expire_hours} hours."
        )
        return self._send_email(to_email=email, subject=subject, body_text=body_text, metadata={"token": token, "type": "password_reset"})

    def _send_email(self, to_email: str, subject: str, body_text: str, metadata: Optional[dict[str, Any]] = None) -> bool:
        record = {
            "to": to_email,
            "subject": subject,
            "body": body_text,
            "metadata": metadata or {},
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }
        self.sent_emails.append(record)

        if settings.smtp_host:
            try:
                msg = MIMEMultipart()
                msg["From"] = settings.email_from
                msg["To"] = to_email
                msg["Subject"] = subject
                msg.attach(MIMEText(body_text, "plain"))

                with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                    if settings.smtp_user and settings.smtp_password:
                        server.starttls()
                        server.login(settings.smtp_user, settings.smtp_password)
                    server.sendmail(settings.email_from, [to_email], msg.as_string())
                logger.info("Sent email to %s: %s", to_email, subject)
                return True
            except Exception as e:
                logger.error("Failed to send SMTP email to %s: %s", to_email, e)
                return False
        else:
            logger.info("Email service (simulated delivery) to %s: %s", to_email, subject)
            return True


email_service = EmailService()
