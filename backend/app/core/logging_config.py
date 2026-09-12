"""
Structured logging. In production (json_logs=True) every log line is a
single JSON object - this is what lets you query logs by field (method_used,
request_id, status_code, latency_ms) in something like CloudWatch Logs
Insights, Datadog, or Loki instead of grepping unstructured text.
"""
import logging
import sys
import uuid
from contextvars import ContextVar

from pythonjsonlogger import jsonlogger

from app.core.config import settings

_request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


def get_request_id() -> str:
    return _request_id_ctx.get()


def set_request_id(value: str | None = None) -> str:
    value = value or str(uuid.uuid4())
    _request_id_ctx.set(value)
    return value


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


def configure_logging() -> None:
    root = logging.getLogger()
    root.setLevel(settings.log_level)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())

    if settings.json_logs:
        formatter = jsonlogger.JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(request_id)s %(message)s"
        )
    else:
        formatter = logging.Formatter(
            "%(asctime)s [%(levelname)s] [%(request_id)s] %(name)s: %(message)s"
        )
    handler.setFormatter(formatter)
    root.addHandler(handler)
