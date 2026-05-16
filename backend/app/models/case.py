from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from ..database import Base


class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True)
    case_name = Column(String(200), nullable=False, default="待分析案件")
    case_type = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="待处理")
    progress = Column(Integer, default=0)
    summary = Column(Text, default="")
    complainant = Column(JSONB, default={})
    respondent = Column(JSONB, default={})
    project_info = Column(JSONB, default={})
    complaint_items = Column(JSONB, default=[])
    analysis_result = Column(JSONB, default={})
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    documents = relationship("CaseDocument", back_populates="case", cascade="all, delete-orphan")
    processing_status = relationship("CaseProcessingStatus", back_populates="case", uselist=False, cascade="all, delete-orphan")
