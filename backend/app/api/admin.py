"""
Admin Control Center endpoints:
- User & role management (list, role change, activation/deactivation)
- System-wide classification telemetry & method distribution
- Dynamic regex rule management (CRUD with runtime cache reload)
- ML model version registry inspection & hot-activation
- Audit log querying
All endpoints strictly require the 'admin' role.
"""
from datetime import datetime, timezone
import os
from pathlib import Path
import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_classification_service
from app.api.security import require_role
from app.core.metrics import metrics_collector
from app.db.models import AuditLog, ClassificationRecord, DbRegexRule, Subscription, User
from app.db.session import get_db
from app.models.schemas import (
    AuditLogResponse,
    ClassificationHistoryItem,
    ModelVersionResponse,
    ObservabilityStatsResponse,
    RegexRuleCreate,
    RegexRuleResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.repositories.postgres import (
    SqlAuditLogRepository,
    SqlRegexRuleRepository,
    SqlUserRepository,
)
from app.services.classification_service import ClassificationService
from app.services.ml_classifier import MLClassifier
from app.services.regex_classifier import RegexRule

router = APIRouter(
    prefix="/admin",
    tags=["admin-control-center"],
    dependencies=[Depends(require_role("admin"))],
)


# --- User & Role Management ---

@router.get("/users")
def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    role: Optional[str] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
    q: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """List all users with optional filtering by role, status, or search query."""
    user_repo = SqlUserRepository(db)
    users, total = user_repo.list_users(skip=skip, limit=limit, role=role, is_active=is_active, query=q)
    return {
        "users": [UserResponse.model_validate(u) for u in users],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    request: UserUpdateRequest,
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Change a user's role, active status, or details, and record an audit log."""
    user_repo = SqlUserRepository(db)
    audit_repo = SqlAuditLogRepository(db)

    user = user_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    update_data: dict[str, Any] = {}
    if request.role is not None:
        update_data["role"] = request.role.value
    if request.is_active is not None:
        update_data["is_active"] = request.is_active
    if request.full_name is not None:
        update_data["full_name"] = request.full_name

    updated_user = user_repo.update(user, **update_data)

    # Record audit log entry
    audit_repo.log(
        actor_id=current_admin.id,
        action="USER_UPDATE",
        target=f"user:{user_id}",
        metadata={"changes": update_data, "admin_email": current_admin.email},
    )

    return updated_user


# --- System-wide Classification Activity & Telemetry ---

@router.get("/classifications")
def get_system_classifications(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    method_used: Optional[str] = Query(default=None),
    label: Optional[str] = Query(default=None),
    user_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    """View system-wide classification telemetry with method distribution breakdown."""
    query = db.query(ClassificationRecord)
    if method_used:
        query = query.filter(ClassificationRecord.method_used == method_used)
    if label:
        query = query.filter(ClassificationRecord.label == label)
    if user_id:
        query = query.filter(ClassificationRecord.user_id == user_id)

    total = query.count()
    records = query.order_by(ClassificationRecord.created_at.desc()).offset(skip).limit(limit).all()

    # Aggregate telemetry for charts (is LLM traffic growing?)
    method_counts = (
        db.query(ClassificationRecord.method_used, func.count(ClassificationRecord.id))
        .group_by(ClassificationRecord.method_used)
        .all()
    )
    distribution = {method: count for method, count in method_counts}

    return {
        "items": [ClassificationHistoryItem.model_validate(r) for r in records],
        "total": total,
        "method_distribution": distribution,
        "skip": skip,
        "limit": limit,
    }


# --- Dynamic Regex Rule Management ---

@router.get("/regex-rules", response_model=list[RegexRuleResponse])
def list_regex_rules(db: Session = Depends(get_db)):
    """List all persisted dynamic regex classification rules."""
    rule_repo = SqlRegexRuleRepository(db)
    return rule_repo.list_active()


@router.post("/regex-rules", response_model=RegexRuleResponse, status_code=status.HTTP_201_CREATED)
def create_regex_rule(
    request: RegexRuleCreate,
    current_admin: User = Depends(require_role("admin")),
    service: ClassificationService = Depends(get_classification_service),
    db: Session = Depends(get_db),
):
    """Validate, persist, and live-reload a new regex classification rule without redeployment."""
    try:
        compiled = re.compile(request.pattern, re.IGNORECASE)
    except re.error as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid regular expression syntax: {exc}",
        )

    rule_repo = SqlRegexRuleRepository(db)
    audit_repo = SqlAuditLogRepository(db)

    rule = rule_repo.create(
        label=request.label,
        pattern=request.pattern,
        description=request.description,
    )

    # Hot-reload rule into in-memory classifier pipeline
    service.regex_classifier.rules.append(
        RegexRule(label=rule.label, pattern=compiled)
    )

    audit_repo.log(
        actor_id=current_admin.id,
        action="RULE_CREATE",
        target=f"rule:{rule.id}",
        metadata={"label": rule.label, "pattern": rule.pattern},
    )

    return rule


@router.delete("/regex-rules/{rule_id}", status_code=status.HTTP_200_OK)
def delete_regex_rule(
    rule_id: int,
    current_admin: User = Depends(require_role("admin")),
    service: ClassificationService = Depends(get_classification_service),
    db: Session = Depends(get_db),
):
    """Delete a regex rule and live-reload the in-memory rules list."""
    rule_repo = SqlRegexRuleRepository(db)
    audit_repo = SqlAuditLogRepository(db)

    success = rule_repo.delete(rule_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")

    # Reload active rules from DB into service
    active_db_rules = rule_repo.list_active()
    new_rules = []
    for r in active_db_rules:
        try:
            new_rules.append(RegexRule(label=r.label, pattern=re.compile(r.pattern, re.IGNORECASE)))
        except re.error:
            pass
    service.regex_classifier.rules = new_rules or service.regex_classifier._default_rules()

    audit_repo.log(
        actor_id=current_admin.id,
        action="RULE_DELETE",
        target=f"rule:{rule_id}",
    )

    return {"status": "deleted", "rule_id": rule_id}


# --- Model Registry & Hot-Swap ---

@router.get("/models", response_model=list[ModelVersionResponse])
def list_models(service: ClassificationService = Depends(get_classification_service)):
    """List registered machine learning models and active status."""
    registry_path = Path(settings.model_registry_path)
    models = []
    is_active_model = service.ml_classifier is not None and service.ml_classifier.classifier is not None

    models.append(
        ModelVersionResponse(
            name=settings.embedding_model_name,
            version="v1.0-current",
            is_active=is_active_model,
            description="Logistic Regression head over BERT embeddings",
        )
    )
    if registry_path.exists():
        for item in registry_path.iterdir():
            if item.is_dir():
                models.append(
                    ModelVersionResponse(
                        name=f"registry/{item.name}",
                        version=item.name,
                        is_active=False,
                        description=f"Model artifact directory at {item.name}",
                    )
                )

    return models


@router.post("/models/{version}/activate")
def activate_model_version(
    version: str,
    current_admin: User = Depends(require_role("admin")),
    service: ClassificationService = Depends(get_classification_service),
    db: Session = Depends(get_db),
):
    """Swap the active machine learning model artifact without server restart."""
    target_path = Path(settings.model_registry_path) / version
    if not (target_path / "classifier.joblib").exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model artifact not found at {target_path}",
        )

    try:
        service.ml_classifier = MLClassifier.load(target_path, settings.embedding_model_name)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load model: {exc}",
        )

    audit_repo = SqlAuditLogRepository(db)
    audit_repo.log(
        actor_id=current_admin.id,
        action="MODEL_ACTIVATE",
        target=f"model:{version}",
    )

    return {"status": "activated", "version": version}


# --- Audit Logs ---

@router.get("/audit-logs")
def list_audit_logs(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    action: Optional[str] = Query(default=None),
    actor_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Query system audit trail of admin actions."""
    audit_repo = SqlAuditLogRepository(db)
    logs, total = audit_repo.list_logs(skip=skip, limit=limit, action=action, actor_id=actor_id)
    return {
        "audit_logs": [AuditLogResponse.model_validate(log) for log in logs],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


# --- Secrets Management & Secret Rotation ---

@router.get("/secrets/status")
def get_secrets_status():
    """Returns metadata about the active secrets provider and rotation history."""
    from app.core.secrets import secrets_manager
    return secrets_manager.get_status()


@router.post("/secrets/rotate-jwt")
def rotate_jwt_secret(
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Rotates the active JWT signing key.
    Moves current secret to previous secret to allow existing unexpired tokens to remain valid.
    Because refresh tokens are stored server-side in PostgreSQL, rotating the secret does NOT
    force users to re-login: expiring access tokens smoothly refresh via /auth/refresh.
    """
    from app.core.secrets import secrets_manager
    new_secret, old_secret = secrets_manager.rotate_secret("JWT_SECRET_KEY")

    audit_repo = SqlAuditLogRepository(db)
    audit_repo.log(
        actor_id=current_admin.id,
        action="JWT_SECRET_ROTATED",
        target="secrets:JWT_SECRET_KEY",
        metadata={
            "has_previous_secret": old_secret is not None,
            "rotated_by": current_admin.email,
        },
    )

    return {
        "status": "rotated",
        "message": "JWT secret successfully rotated. Client sessions remain uninterrupted.",
        "secrets_status": secrets_manager.get_status(),
    }


# --- Database Status ---

@router.get("/database/status")
def get_database_status(db: Session = Depends(get_db)):
    """
    Returns PostgreSQL database metrics and operational status.
    Uses PostgreSQL exclusively as the single unified database for the entire application.
    """
    total_users = db.query(User).count()
    total_records = db.query(ClassificationRecord).count()
    total_logs = db.query(AuditLog).count()

    return {
        "database": "PostgreSQL",
        "architecture": "Single Unified Relational Database",
        "status": "connected",
        "metrics": {
            "total_users": total_users,
            "total_classification_records": total_records,
            "total_audit_logs": total_logs,
        },
        "foreign_key_integrity": "Enforced natively via PostgreSQL DDL",
    }


# --- Observability Dashboard Stats ---

@router.get("/observability/stats", response_model=ObservabilityStatsResponse)
def get_observability_stats(
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Returns real-time aggregated metrics broken down per-user role,
    subscription plan tier, authentication events, and classification layers.
    Powers the Admin Control Center Observability Dashboard.
    """
    # 1. Role distribution
    role_counts = db.query(User.role, func.count(User.id)).group_by(User.role).all()
    roles_dict = {r: count for r, count in role_counts}

    # 2. Plan tier distribution
    tier_counts = db.query(Subscription.plan_tier, func.count(Subscription.id)).group_by(Subscription.plan_tier).all()
    tiers_dict = {"free": db.query(User).count() - sum(c for _, c in tier_counts)}
    for t, c in tier_counts:
        tiers_dict[t] = c

    # Update Prometheus gauge
    metrics_collector.update_subscriptions_gauge(tiers_dict)

    summary = metrics_collector.get_dashboard_summary()

    # Combine DB persisted counts with collector real-time counters
    requests_by_role = {"admin": roles_dict.get("admin", 0), "user": roles_dict.get("user", 0)}
    for k, v in summary["requests_by_role"].items():
        role_part = k.split(":")[0]
        requests_by_role[role_part] = requests_by_role.get(role_part, 0) + v

    classifications_by_tier = dict(tiers_dict)
    for k, v in summary["classifications_by_tier"].items():
        tier_part = k.split(":")[0]
        classifications_by_tier[tier_part] = classifications_by_tier.get(tier_part, 0) + v

    return ObservabilityStatsResponse(
        requests_by_role=requests_by_role,
        classifications_by_tier=classifications_by_tier,
        auth_events_summary=summary["auth_events_summary"],
        system_health={
            "database": "PostgreSQL",
            "active_rules": len(get_classification_service().regex_classifier.rules),
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


