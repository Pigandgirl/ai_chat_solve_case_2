from .auth import router as auth_router
from .cases import router as cases_router
from .documents import router as documents_router
from .websocket import router as websocket_router

__all__ = ["auth_router", "cases_router", "documents_router", "websocket_router"]
