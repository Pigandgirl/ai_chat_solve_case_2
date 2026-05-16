import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://law_user:law_pass_2024@localhost:5432/law_case_system"
    )
    DATABASE_URL_SYNC: str = os.getenv(
        "DATABASE_URL_SYNC",
        "postgresql+psycopg2://law_user:law_pass_2024@localhost:5432/law_case_system"
    )
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
    MINIO_BUCKET: str = os.getenv("MINIO_BUCKET", "legal-cases")
    MINIO_SECURE: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"
    JWT_SECRET: str = os.getenv("JWT_SECRET", "law_case_jwt_secret_2024")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRES_IN: int = 7 * 24 * 60 * 60
    MAX_UPLOAD_FILES: int = 10
    MAX_FILE_SIZE_MB: int = 50
    UPLOAD_ALLOWED_TYPES: list = ["application/pdf"]
    OCR_CONFIDENCE_THRESHOLD: float = 0.8
    SILICONFLOW_API_KEY: str = os.getenv("SILICONFLOW_API_KEY", "")
    SILICONFLOW_OCR_MODEL: str = os.getenv("SILICONFLOW_OCR_MODEL", "PaddlePaddle/PaddleOCR-VL-1.5")
    SILICONFLOW_EMBEDDING_MODEL: str = os.getenv("SILICONFLOW_EMBEDDING_MODEL", "BAAI/bge-large-zh-v1.5")
    SILICONFLOW_BASE_URL: str = "https://api.siliconflow.cn/v1"
    MINIMAX_API_KEY: str = os.getenv("MINIMAX_API_KEY", "")
    MINIMAX_MODEL: str = os.getenv("MINIMAX_MODEL", "MiniMax-M2.7-highspeed")
    MINIMAX_BASE_URL: str = "https://api.minimaxi.com/v1"
    CHROMA_PERSIST_DIR: str = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
    LLM_MAX_RETRIES: int = 3

    class Config:
        env_file = ".env"


settings = Settings()
