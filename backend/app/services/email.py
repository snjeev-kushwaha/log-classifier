"""
Email delivery service supporting credentials delivery, email verification, and password resets.
Provides simulated delivery (for tests/development) and robust SMTP delivery (for Gmail, Outlook, SES, SendGrid, etc.).
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Background executor for external SMTP network calls so HTTP requests never block
_email_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="smtp_delivery")


class EmailService:
    def __init__(self):
        # In-memory store for sent emails (useful for automated testing and local debugging)
        self.sent_emails: list[dict[str, Any]] = []

    def send_welcome_credentials_email(self, email: str, password: str, full_name: Optional[str] = None) -> bool:
        """
        Sends the registered user their login credentials so they can store and reference them later.
        """
        greeting = f"Hello {full_name}," if full_name else "Hello,"
        subject = "Welcome! Your Account Credentials - Hybrid Log Classifier"

        body_text = (
            f"{greeting}\n\n"
            f"Thank you for registering an account on Hybrid Log Classifier!\n\n"
            f"Here are your login credentials for future reference:\n"
            f"--------------------------------------------------\n"
            f"Login Email:  {email}\n"
            f"Password:     {password}\n"
            f"Platform URL: {settings.frontend_origin}\n"
            f"--------------------------------------------------\n\n"
            f"Please keep this email in a safe place so you can reference your password whenever needed.\n"
            f"You can log in anytime to access classification, download CSV reports, manage personal API keys, and view quotas.\n\n"
            f"Best regards,\n"
            f"The Hybrid Log Classifier Team"
        )

        body_html = f"""
        <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f9f9f9; padding: 20px;">
            <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
              <h2 style="color: #1976d2; margin-top: 0;">Welcome to Hybrid Log Classifier</h2>
              <p>{greeting}</p>
              <p>Your account has been registered successfully. Here are your account credentials for future reference:</p>
              
              <div style="background: #f4f6f8; border-left: 4px solid #1976d2; padding: 16px; border-radius: 4px; margin: 20px 0;">
                <p style="margin: 4px 0;"><strong>Login Email:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px; border: 1px solid #ddd;">{email}</code></p>
                <p style="margin: 4px 0;"><strong>Password:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px; border: 1px solid #ddd;">{password}</code></p>
                <p style="margin: 4px 0;"><strong>Access URL:</strong> <a href="{settings.frontend_origin}" style="color: #1976d2;">{settings.frontend_origin}</a></p>
              </div>

              <p style="font-size: 0.9rem; color: #666;">
                Tip: Keep this email saved in your inbox so you can look up your password whenever you need it.
              </p>

              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 0.8rem; color: #999; margin-bottom: 0;">
                Hybrid Log Classifier Platform &bull; High-throughput Regex, BERT ML &amp; Groq LLM Intelligence
              </p>
            </div>
          </body>
        </html>
        """

        return self._send_email(
            to_email=email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            metadata={"email": email, "type": "welcome_credentials"},
        )

    def send_verification_email(self, email: str, token: str) -> bool:
        verification_link = f"{settings.frontend_origin.rstrip('/')}?verify_token={token}"
        subject = "Verify your email address - Hybrid Log Classifier"
        body_text = (
            f"Welcome to Hybrid Log Classifier!\n\n"
            f"Please verify your email address by visiting the link below:\n"
            f"{verification_link}\n\n"
            f"This link expires in {settings.verification_token_expire_hours} hours."
        )
        body_html = f"""
        <html>
          <body style="font-family: sans-serif; line-height: 1.6; color: #333; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
              <h3 style="color: #1976d2;">Verify Your Email</h3>
              <p>Please click the button below to verify your email address:</p>
              <p style="margin: 20px 0;">
                <a href="{verification_link}" style="background: #1976d2; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; display: inline-block;">Verify Email Address</a>
              </p>
              <p style="font-size: 0.85rem; color: #777;">Link expires in {settings.verification_token_expire_hours} hours.</p>
            </div>
          </body>
        </html>
        """
        return self._send_email(
            to_email=email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            metadata={"token": token, "type": "verify_email"},
        )

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
        body_html = f"""
        <html>
          <body style="font-family: sans-serif; line-height: 1.6; color: #333; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
              <h3 style="color: #d32f2f;">Reset Your Password</h3>
              <p>Click the button below to choose a new password:</p>
              <p style="margin: 20px 0;">
                <a href="{reset_link}" style="background: #d32f2f; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; display: inline-block;">Reset Password</a>
              </p>
              <p style="font-size: 0.85rem; color: #777;">Link expires in {settings.password_reset_token_expire_hours} hours.</p>
            </div>
          </body>
        </html>
        """
        return self._send_email(
            to_email=email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            metadata={"token": token, "type": "password_reset"},
        )

    def _send_email(
        self,
        to_email: str,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> bool:
        record = {
            "to": to_email,
            "subject": subject,
            "body": body_text,
            "body_html": body_html,
            "metadata": metadata or {},
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }
        self.sent_emails.append(record)

        if settings.smtp_host:
            msg = MIMEMultipart("alternative")
            msg["From"] = settings.email_from
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body_text, "plain"))
            if body_html:
                msg.attach(MIMEText(body_html, "html"))

            # Dispatch network call asynchronously so callers never block on SMTP latency
            _email_executor.submit(self._deliver_smtp, msg, to_email, subject)
            return True
        else:
            logger.info("Email service (simulated delivery) to %s: %s", to_email, subject)
            return True

    def _deliver_smtp(self, msg: MIMEMultipart, to_email: str, subject: str) -> None:
        try:
            if settings.smtp_port == 465:
                with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=4.0) as server:
                    if settings.smtp_user and settings.smtp_password:
                        server.login(settings.smtp_user, settings.smtp_password)
                    server.sendmail(settings.email_from, [to_email], msg.as_string())
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=4.0) as server:
                    server.starttls()
                    if settings.smtp_user and settings.smtp_password:
                        server.login(settings.smtp_user, settings.smtp_password)
                    server.sendmail(settings.email_from, [to_email], msg.as_string())

            try:
                logger.info("Sent email to %s via SMTP (%s): %s", to_email, settings.smtp_host, subject)
            except Exception:
                pass
        except Exception as e:
            try:
                logger.error("Failed to send SMTP email to %s: %s", to_email, e)
            except Exception:
                pass


email_service = EmailService()
