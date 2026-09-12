"""
Pydantic request/response schemas shared across the API layer.
"""
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ClassificationMethod(str, Enum):
    REGEX = "regex"
    ML = "ml"
    LLM = "llm"
    HUMAN_REVIEW = "human_review"


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
