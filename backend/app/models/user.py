from sqlalchemy import Column, Integer, String, DateTime, func

from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=False)
    email = Column(String(100), nullable=True)
    role = Column(String(20), nullable=False, default="user", server_default="user")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
