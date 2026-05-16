from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, func
from sqlalchemy.orm import relationship

from ..database import Base


class CaseProcessingStatus(Base):
    __tablename__ = "case_processing_status"

    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), primary_key=True)
    status = Column(String(20), default="pending")
    progress = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    case = relationship("Case", back_populates="processing_status")
