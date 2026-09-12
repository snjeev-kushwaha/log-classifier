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
