import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import auth_router, cases_router, documents_router, websocket_router
from .database import init_db
from .services.minio_service import minio_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[App] Starting up...")
    try:
        await init_db()
        logger.info("[App] Database tables initialized")
    except Exception as e:
        logger.warning(f"[App] Database init warning: {e}")

    try:
        await minio_service.ensure_bucket()
        logger.info("[App] MinIO bucket ensured")
    except Exception as e:
        logger.warning(f"[App] MinIO init warning: {e}")

    logger.info("[App] Server ready")
    yield
    logger.info("[App] Shutting down...")


app = FastAPI(
    title="法律智能辅助办案系统 API",
    description="粤省法智能辅助办案系统 - 文档上传、OCR识别、案件管理",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(cases_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(websocket_router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "2.0.0"}
