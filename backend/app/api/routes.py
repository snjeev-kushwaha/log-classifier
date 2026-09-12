"""
HTTP layer. Thin by design - all decision logic lives in ClassificationService.
"""
import csv
import io
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_classification_service
from app.api.rate_limit import limiter
from app.api.security import require_api_key
from app.core.config import settings
from app.db.models import ClassificationRecord
from app.db.session import get_db
from app.models.schemas import (
    ClassificationResult,
    FeedbackRequest,
    HealthResponse,
    LogClassifyRequest,
)
from app.services.classification_service import ClassificationService

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
    db: Session = Depends(get_db),
):
    result = service.classify(payload.text, source=payload.source)

    record = ClassificationRecord(
        text=result.text,
        label=result.label,
        confidence=result.confidence,
        method_used=result.method_used.value,
        needs_human_review=result.needs_human_review,
    )
    db.add(record)
    db.commit()

    return result


@router.post("/classify/batch", dependencies=[Depends(require_api_key)])
@limiter.limit(f"{settings.batch_rate_limit_per_minute}/minute")
async def classify_batch(
    request: Request,
    file: UploadFile,
    service: ClassificationService = Depends(get_classification_service),
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
