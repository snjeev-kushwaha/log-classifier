"""
HTTP layer. Thin by design - all decision logic lives in ClassificationService.
"""
import csv
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_classification_service
from app.api.rate_limit import limiter
from app.api.security import get_optional_current_user, require_api_key
from app.core.config import settings
from app.core.metrics import metrics_collector
from app.db.models import ClassificationRecord, Notification, Subscription, User
from app.db.session import get_db
from app.models.schemas import (
    ClassificationMethod,
    ClassificationResult,
    FeedbackRequest,
    HealthResponse,
    LogClassifyRequest,
)
from app.repositories.postgres import (
    SqlNotificationRepository,
    SqlRegexRuleRepository,
    SqlSubscriptionRepository,
    SqlUsageRepository,
)
from app.services.billing import get_tier_daily_quota
from app.services.classification_service import ClassificationService
import re
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
router = APIRouter()

REQUIRED_BATCH_COLUMNS = {"log_message"}


@router.get("/health", response_model=HealthResponse)
def health(service: ClassificationService = Depends(get_classification_service)):
    """Liveness/readiness probe. Deliberately excluded from auth and rate
    limiting so orchestrators (k8s, ECS, a load balancer) can always reach it."""
    return HealthResponse(
        status="ok",
        ml_model_loaded=service.ml_classifier is not None and service.ml_classifier.classifier is not None,
        regex_rule_count=len(service.regex_classifier.rules),
    )


@router.post("/classify", response_model=ClassificationResult, dependencies=[Depends(require_api_key)])
@limiter.limit(f"{settings.rate_limit_per_minute}/minute")
def classify_log(
    request: Request,  # required by slowapi to read the client key
    payload: LogClassifyRequest,
    service: ClassificationService = Depends(get_classification_service),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    user_tier = "free"
    effective_quota = settings.daily_user_quota

    # Enforce daily quota if user is authenticated (real user id > 0)
    if current_user and current_user.id and current_user.id > 0:
        sub_repo = SqlSubscriptionRepository(db)
        user_sub = sub_repo.get_by_user_id(current_user.id)
        if user_sub and user_sub.status == "active":
            user_tier = user_sub.plan_tier
            effective_quota = get_tier_daily_quota(user_tier)

        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        usage_repo = SqlUsageRepository(db)
        count, within_limit = usage_repo.increment_and_check(current_user.id, today_str, effective_quota)
        if not within_limit:
            raise HTTPException(
                status_code=429,
                detail=f"Daily usage quota exceeded ({effective_quota} classifications/day for {user_tier.upper()} plan).",
            )

        # In-app quota warning notification when reaching >= 80%
        if count >= int(effective_quota * 0.8):
            notif_repo = SqlNotificationRepository(db)
            existing_warning = (
                db.query(Notification)
                .filter(Notification.user_id == current_user.id, Notification.type == "quota_warning")
                .order_by(Notification.created_at.desc())
                .first()
            )
            if not existing_warning or existing_warning.created_at.strftime("%Y-%m-%d") != today_str:
                pct = int((count / effective_quota) * 100)
                notif_repo.create(
                    user_id=current_user.id,
                    title="Daily Quota Warning",
                    message=f"You have used {count} of {effective_quota} daily classifications ({pct}%). Consider upgrading your plan if you need more capacity.",
                    type="quota_warning",
                )

    # Check dynamic DB regex rules first if any exist
    rule_repo = SqlRegexRuleRepository(db)
    active_rules = rule_repo.list_active()
    dynamic_match_label = None
    for r in active_rules:
        try:
            if re.search(r.pattern, payload.text, re.IGNORECASE):
                dynamic_match_label = r.label
                break
        except Exception:
            pass

    if dynamic_match_label:
        result = ClassificationResult(
            text=payload.text,
            label=dynamic_match_label,
            confidence=1.0,
            method_used=ClassificationMethod.REGEX,
            needs_human_review=False,
        )
    else:
        result = service.classify(payload.text, source=payload.source)

    record = ClassificationRecord(
        user_id=current_user.id if (current_user and current_user.id > 0) else None,
        text=result.text,
        label=result.label,
        confidence=result.confidence,
        method_used=result.method_used.value,
        needs_human_review=result.needs_human_review,
    )
    db.add(record)
    db.commit()

    metrics_collector.record_classification(user_tier, result.method_used.value)
    metrics_collector.record_request(current_user.role if current_user else "anonymous", "/classify", 200)

    return result


@router.post("/classify/batch", dependencies=[Depends(require_api_key)])
@limiter.limit(f"{settings.batch_rate_limit_per_minute}/minute")
async def classify_batch(
    request: Request,
    file: UploadFile,
    service: ClassificationService = Depends(get_classification_service),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    """
    Batch-classify a CSV of logs and stream back a CSV with the results
    added. Expects a `log_message` column and an optional `source` column
    (used for the source-based LLM-only routing override).

    Streams the response rather than writing to a shared file on disk, so
    concurrent uploads never collide - the reference tutorial this project
    is based on wrote every batch to a single fixed `output.csv`, which
    silently corrupts results under concurrent requests.
    """
    if file.content_type not in ("text/csv", "application/vnd.ms-excel", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Expected a CSV file upload")

    raw_bytes = await file.read()
    try:
        decoded = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Could not decode file as UTF-8: {exc}") from exc

    reader = csv.DictReader(io.StringIO(decoded))
    if reader.fieldnames is None or not REQUIRED_BATCH_COLUMNS.issubset(set(reader.fieldnames)):
        raise HTTPException(
            status_code=400,
            detail=f"CSV must contain columns: {sorted(REQUIRED_BATCH_COLUMNS)}. "
            f"Found: {reader.fieldnames}",
        )

    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file has no data rows")
    if len(rows) > settings.max_batch_rows:
        raise HTTPException(
            status_code=413,
            detail=f"Batch has {len(rows)} rows, exceeding the limit of {settings.max_batch_rows}. "
            "Split into smaller files.",
        )

    output_fieldnames = list(reader.fieldnames) + ["predicted_label", "confidence", "method_used", "needs_human_review"]
    output_buffer = io.StringIO()
    writer = csv.DictWriter(output_buffer, fieldnames=output_fieldnames)
    writer.writeheader()

    records_to_persist = []
    for row in rows:
        text = (row.get("log_message") or "").strip()
        if not text:
            writer.writerow({**row, "predicted_label": "", "confidence": "", "method_used": "skipped_empty", "needs_human_review": ""})
            continue

        result = service.classify(text, source=row.get("source"))
        writer.writerow({
            **row,
            "predicted_label": result.label,
            "confidence": f"{result.confidence:.4f}",
            "method_used": result.method_used.value,
            "needs_human_review": result.needs_human_review,
        })
        records_to_persist.append(
            ClassificationRecord(
                user_id=current_user.id if current_user else None,
                text=result.text,
                label=result.label,
                confidence=result.confidence,
                method_used=result.method_used.value,
                needs_human_review=result.needs_human_review,
            )
        )

    if records_to_persist:
        db.bulk_save_objects(records_to_persist)
        db.commit()

    if current_user and current_user.id and current_user.id > 0:
        notif_repo = SqlNotificationRepository(db)
        notif_repo.create(
            user_id=current_user.id,
            title="Batch Processing Completed",
            message=f"Successfully classified {len(rows)} log entries from {file.filename or 'uploaded CSV'}.",
            type="batch_completed",
        )

    output_buffer.seek(0)
    logger.info("Batch classified %s rows from %s", len(rows), file.filename)
    return StreamingResponse(
        iter([output_buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="classified_{file.filename or "logs.csv"}"'},
    )


@router.post("/feedback", status_code=204, dependencies=[Depends(require_api_key)])
def submit_feedback(request: FeedbackRequest, db: Session = Depends(get_db)):
    """Human-in-the-loop correction. This is what feeds the retraining pipeline."""
    record = (
        db.query(ClassificationRecord)
        .filter(ClassificationRecord.text == request.text)
        .order_by(ClassificationRecord.created_at.desc())
        .first()
    )
    if record:
        record.corrected_label = request.correct_label
        record.needs_human_review = False
        db.commit()
    return None
