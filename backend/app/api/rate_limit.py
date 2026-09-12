"""
Per-client-IP rate limiting via slowapi (a Flask-limiter-style wrapper for
FastAPI/Starlette). Protects the classification endpoints - especially the
LLM path - from being hammered by a misbehaving client or retry storm.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(key_func=get_remote_address, default_limits=[f"{settings.rate_limit_per_minute}/minute"])
