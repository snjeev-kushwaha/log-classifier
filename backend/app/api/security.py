"""
Minimal API key auth. Good enough for service-to-service calls behind an
internal network or API gateway; swap for OAuth2/JWT if this API is ever
exposed directly to end users rather than the trusted React frontend.

Auth is a no-op when settings.api_keys is empty, so local dev / the test
suite don't need a key configured - but this MUST be set in staging and
production (enforced in app.main via a startup check).
"""
from fastapi import Header, HTTPException, status

from app.core.config import settings


async def require_api_key(x_api_key: str = Header(default="")) -> None:
    valid_keys = settings.api_keys_set
    if not valid_keys:
        return  # auth disabled - local dev only, see module docstring
    if x_api_key not in valid_keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key",
        )
