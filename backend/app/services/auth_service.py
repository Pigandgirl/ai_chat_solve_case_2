from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext

from ..config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    @staticmethod
    def hash_password(password: str) -> str:
        return pwd_context.hash(password)

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def create_token(user_id: int, username: str, role: str = "user") -> str:
        expire = datetime.utcnow() + timedelta(seconds=settings.JWT_EXPIRES_IN)
        payload = {
            "sub": str(user_id),
            "username": username,
            "role": role,
            "exp": expire,
            "iat": datetime.utcnow(),
        }
        return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    @staticmethod
    def decode_token(token: str) -> dict | None:
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            return payload
        except JWTError:
            return None


auth_service = AuthService()
