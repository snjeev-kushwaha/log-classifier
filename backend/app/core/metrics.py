"""
Observability and Prometheus metrics module.
Provides counters, gauges, and aggregations broken down per-user, per-role, and per-plan tier.
"""
from collections import defaultdict
from datetime import datetime, timezone
import logging
from typing import Any, Optional

from prometheus_client import Counter, Gauge

logger = logging.getLogger(__name__)

# --- Prometheus Metrics ---

AUTH_EVENTS_COUNTER = Counter(
    "log_classifier_auth_events_total",
    "Authentication events by event type, status, and user role",
    ["event_type", "status", "role"],
)

REQUESTS_BY_ROLE_COUNTER = Counter(
    "log_classifier_requests_by_role_total",
    "API requests categorized by user role, endpoint, and status code",
    ["role", "endpoint", "status_code"],
)

CLASSIFICATIONS_BY_TIER_COUNTER = Counter(
    "log_classifier_classifications_by_tier_total",
    "Classifications broken down by user subscription tier and classification layer",
    ["tier", "method_used"],
)

ACTIVE_SUBSCRIPTIONS_GAUGE = Gauge(
    "log_classifier_active_subscriptions_gauge",
    "Active subscriptions count grouped by plan tier",
    ["tier"],
)


class ObservabilityCollector:
    def __init__(self):
        # In-memory tally for fast UI dashboard visualization
        self.auth_events_tally: dict[str, int] = defaultdict(int)
        self.requests_by_role_tally: dict[str, int] = defaultdict(int)
        self.classifications_by_tier_tally: dict[str, int] = defaultdict(int)

    def record_auth_event(self, event_type: str, status: str, role: str = "anonymous"):
        AUTH_EVENTS_COUNTER.labels(event_type=event_type, status=status, role=role).inc()
        key = f"{event_type}_{status}_{role}"
        self.auth_events_tally[key] += 1

    def record_request(self, role: str, endpoint: str, status_code: int):
        REQUESTS_BY_ROLE_COUNTER.labels(role=role, endpoint=endpoint, status_code=str(status_code)).inc()
        key = f"{role}:{endpoint}"
        self.requests_by_role_tally[key] += 1

    def record_classification(self, tier: str, method_used: str):
        CLASSIFICATIONS_BY_TIER_COUNTER.labels(tier=tier, method_used=method_used).inc()
        key = f"{tier}:{method_used}"
        self.classifications_by_tier_tally[key] += 1

    def update_subscriptions_gauge(self, tier_counts: dict[str, int]):
        for tier, count in tier_counts.items():
            ACTIVE_SUBSCRIPTIONS_GAUGE.labels(tier=tier).set(count)

    def get_dashboard_summary(self) -> dict[str, Any]:
        return {
            "requests_by_role": dict(self.requests_by_role_tally),
            "classifications_by_tier": dict(self.classifications_by_tier_tally),
            "auth_events_summary": dict(self.auth_events_tally),
            "system_health": {
                "status": "healthy",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        }


metrics_collector = ObservabilityCollector()
