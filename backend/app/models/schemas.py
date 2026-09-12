"""
Pydantic request/response schemas shared across the API layer:
- Classification, feedback & health
- Authentication & users
- RBAC, audit logging & admin controls
- API keys & usage quotas
"""
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, EmailStr, Field


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


class ClassificationMethod(str, Enum):
    REGEX = "regex"
    ML = "ml"
    LLM = "llm"
    HUMAN_REVIEW = "human_review"


# --- Classification Schemas ---

class LogClassifyRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    source: Optional[str] = Field(default=None, description="Originating service/host, if known")


class ClassificationResult(BaseModel):
    text: str
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    method_used: ClassificationMethod
    needs_human_review: bool = False
    reasoning: Optional[str] = None


class FeedbackRequest(BaseModel):
    text: str
    correct_label: str
    original_method: ClassificationMethod


class HealthResponse(BaseModel):
    status: str
    ml_model_loaded: bool
    regex_rule_count: int


# --- Auth & User Schemas ---

class UserSignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    full_name: Optional[str] = Field(default=None, max_length=255)


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class OAuthLoginRequest(BaseModel):
    provider: str = Field(..., description="OAuth provider, e.g. google or github")
    subject_id: str = Field(..., description="Unique user ID from provider")
    email: EmailStr = Field(..., description="Email address verified by provider")
    full_name: Optional[str] = Field(default=None, description="Full name from provider")


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    is_verified: bool
    oauth_provider: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdateRequest(BaseModel):
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None


# --- RBAC & Admin Schemas ---

class AuditLogResponse(BaseModel):
    id: int
    actor_id: Optional[int]
    action: str
    target: Optional[str]
    metadata_json: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class RegexRuleCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    pattern: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = Field(default=None, max_length=255)


class RegexRuleResponse(BaseModel):
    id: int
    label: str
    pattern: str
    description: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ModelVersionResponse(BaseModel):
    name: str
    version: str
    is_active: bool
    description: Optional[str] = None


# --- User Platform: API Keys & Quotas ---

class ApiKeyCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)


class ApiKeyResponse(BaseModel):
    id: int
    prefix: str
    label: str
    is_active: bool
    last_used_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ApiKeyCreateResponse(ApiKeyResponse):
    raw_key: str  # Only returned once upon creation!


class UsageQuotaResponse(BaseModel):
    today_count: int
    daily_limit: int
    remaining: int


class ClassificationHistoryItem(BaseModel):
    id: int
    user_id: Optional[int]
    text: str
    label: str
    confidence: float
    method_used: str
    needs_human_review: bool
    corrected_label: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Phase 7: Email Verification & Password Reset ---

class EmailVerificationConfirm(BaseModel):
    token: str = Field(..., min_length=1)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)


# --- Phase 7: Notifications ---

class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    type: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    unread_count: int


# --- Phase 7: Billing & Plan Tiers ---

class PlanTierInfo(BaseModel):
    tier: str
    name: str
    price_usd: int
    daily_quota: int
    features: list[str]


class SubscriptionResponse(BaseModel):
    plan_tier: str
    status: str
    daily_quota: int
    current_period_end: Optional[datetime] = None
    is_active: bool

    class Config:
        from_attributes = True


class CheckoutSessionRequest(BaseModel):
    plan_tier: str = Field(..., description="Target plan tier: pro or enterprise")
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class CheckoutSessionResponse(BaseModel):
    checkout_url: str
    session_id: str


# --- Phase 7: GDPR & Account Management ---

class DeleteAccountRequest(BaseModel):
    password: Optional[str] = None
    confirmation: str = Field(..., description="Must be 'DELETE MY ACCOUNT'")


class DataExportResponse(BaseModel):
    user_profile: dict[str, Any]
    classification_history: list[dict[str, Any]]
    api_keys: list[dict[str, Any]]
    usage_counters: list[dict[str, Any]]
    notifications: list[dict[str, Any]]
    subscription: Optional[dict[str, Any]] = None
    exported_at: datetime


# --- Phase 7: Observability Dashboard ---

class ObservabilityStatsResponse(BaseModel):
    requests_by_role: dict[str, int]
    classifications_by_tier: dict[str, int]
    auth_events_summary: dict[str, int]
    system_health: dict[str, Any]
