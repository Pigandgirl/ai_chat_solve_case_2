from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, Text, ForeignKey, BigInteger, func
from sqlalchemy.orm import relationship

from ..database import Base


class CaseDocument(Base):
    __tablename__ = "case_documents"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True)
    original_name = Column(String(255), nullable=False)
    storage_path = Column(String(500), nullable=False)
    file_size = Column(BigInteger, default=0)
    file_type = Column(String(50), default="application/pdf")
    ocr_done = Column(Boolean, default=False)
    ocr_result_path = Column(String(500), nullable=True)
    ocr_confidence = Column(Float, default=0.0)
    page_count = Column(Integer, default=0)
    is_scanned = Column(Boolean, default=False)
    category = Column(String(100), default="1_财政厅移交材料", nullable=True)
    error_message = Column(Text, nullable=True)
    analysis_done = Column(Boolean, default=False)
    document_analysis = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, server_default=func.now())

    case = relationship("Case", back_populates="documents")
