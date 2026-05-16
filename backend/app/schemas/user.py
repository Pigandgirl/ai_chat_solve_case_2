from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)
    confirmPassword: str = Field(..., alias="confirmPassword")
    phone: str = Field(..., min_length=11, max_length=20)
    captcha: str = Field(default="000000")

    model_config = {"populate_by_name": True, "populate_by_alias": True, "from_attributes": True}


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    phone: str
    email: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    token: str
    user: UserResponse

    model_config = {"from_attributes": True}
