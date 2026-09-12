"""
Persisted classification records - the feature/label store shown in the
architecture diagram. Every classification (and later, every human
correction) lands here and becomes retraining data for the ML classifier.
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text

from app.db.session import Base


class ClassificationRecord(Base):
    __tablename__ = "classification_records"

    id = Column(Integer, primary_key=True, index=True)
    text = Column(Text, nullable=False)
    label = Column(String(100), nullable=False, index=True)
    confidence = Column(Float, nullable=False)
    method_used = Column(String(20), nullable=False)
    needs_human_review = Column(Boolean, default=False)
    corrected_label = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
