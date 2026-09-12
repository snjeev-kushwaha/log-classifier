"""
OAuth2 client configuration using Authlib.
Supports Google and GitHub authorization-code flows and user info retrieval.
"""
import logging
from typing import Any, Optional

from authlib.integrations.starlette_client import OAuth
from app.core.config import settings

logger = logging.getLogger(__name__)

oauth = OAuth()

# Configure Google OAuth client
if settings.google_client_id:
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )
else:
    oauth.register(
        name="google",
        client_id="unconfigured_google_client_id",
        client_secret="unconfigured_google_client_secret",
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

# Configure GitHub OAuth client
if settings.github_client_id:
    oauth.register(
        name="github",
        client_id=settings.github_client_id,
        client_secret=settings.github_client_secret,
        access_token_url="https://github.com/login/oauth/access_token",
        authorize_url="https://github.com/login/oauth/authorize",
        api_base_url="https://api.github.com/",
        client_kwargs={"scope": "user:email"},
    )
else:
    oauth.register(
        name="github",
        client_id="unconfigured_github_client_id",
        client_secret="unconfigured_github_client_secret",
        access_token_url="https://github.com/login/oauth/access_token",
        authorize_url="https://github.com/login/oauth/authorize",
        api_base_url="https://api.github.com/",
        client_kwargs={"scope": "user:email"},
    )
