from .admin import router as admin_router
from .auth import router as auth_router
from .cases import router as cases_router
from .dashboard import router as dashboard_router
from .documents import router as documents_router
from .websocket import router as websocket_router

__all__ = ["admin_router", "auth_router", "cases_router", "dashboard_router", "documents_router", "websocket_router"]
