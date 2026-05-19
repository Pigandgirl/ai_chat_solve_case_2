from sqlalchemy import Column, Integer, String, DateTime, Text, func

from ..database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    username = Column(String(50), nullable=False, index=True)
    action = Column(String(100), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
