"""
FastAPI application entrypoint.
Run with: uvicorn app.main:app --reload
"""
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.sessions import SessionMiddleware

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.rate_limit import limiter
from app.api.routes import router as routes_router
from app.api.user import router as user_router
from app.core.config import settings
from app.core.logging_config import configure_logging, set_request_id
from app.db.session import Base, engine

configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    if settings.environment == "production" and not settings.api_keys_set:
        # Fail loudly rather than silently serving an unauthenticated API.
        raise RuntimeError(
            "settings.api_keys is empty while environment=production. "
            "Set API_KEYS before deploying."
        )
    if settings.environment == "production" and not settings.groq_api_key:
        logger.warning("GROQ_API_KEY is not set - the LLM fallback layer will be unavailable.")

    # Initialize dynamic regex rules from DB if present
    try:
        from app.api.deps import get_classification_service
        from app.db.session import SessionLocal
        from app.repositories.postgres import SqlRegexRuleRepository
        from app.services.regex_classifier import RegexRule
        import re

        db = SessionLocal()
        rule_repo = SqlRegexRuleRepository(db)
        db_rules = rule_repo.list_active()
        if db_rules:
            service = get_classification_service()
            loaded_rules = []
            for r in db_rules:
                try:
                    loaded_rules.append(RegexRule(label=r.label, pattern=re.compile(r.pattern, re.IGNORECASE)))
                except re.error:
                    pass
            if loaded_rules:
                service.regex_classifier.rules = loaded_rules
        db.close()
    except Exception as exc:
        logger.warning("Could not pre-load DB regex rules: %s", exc)

    logger.info("Startup complete", extra={"environment": settings.environment})
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret_key)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    """Attaches a request ID to every log line emitted while handling this
    request, and logs a single structured summary line per request - the
    minimum needed to debug a production incident from logs alone."""
    request_id = set_request_id(request.headers.get("x-request-id"))
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("Unhandled exception while processing request")
        raise
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request completed",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration_ms, 2),
        },
    )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Never leak internal exception details to the client in production.
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(routes_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(user_router, prefix="/api/v1")

# Exposes GET /metrics in Prometheus text format: request counts, latency
# histograms, and in-progress requests, broken down by path and status code.
Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
