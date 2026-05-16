import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from redis import asyncio as aioredis

from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, case_id: int, websocket: WebSocket):
        await websocket.accept()
        if case_id not in self.active_connections:
            self.active_connections[case_id] = []
        self.active_connections[case_id].append(websocket)
        logger.info(f"[WS] Client connected to case {case_id}, total: {len(self.active_connections[case_id])}")

    def disconnect(self, case_id: int, websocket: WebSocket):
        if case_id in self.active_connections:
            self.active_connections[case_id].remove(websocket)
            if not self.active_connections[case_id]:
                del self.active_connections[case_id]

    async def broadcast(self, case_id: int, message: dict):
        if case_id in self.active_connections:
            dead_connections = []
            for ws in self.active_connections[case_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead_connections.append(ws)
            for ws in dead_connections:
                self.disconnect(case_id, ws)


manager = ConnectionManager()


@router.websocket("/ws/case/{case_id}")
async def websocket_case_progress(websocket: WebSocket, case_id: int):
    await manager.connect(case_id, websocket)

    redis_client = None
    pubsub = None

    try:
        redis_client = aioredis.from_url(settings.REDIS_URL)
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"case_progress:{case_id}")

        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await manager.broadcast(case_id, data)
                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        manager.disconnect(case_id, websocket)
    except Exception as e:
        logger.error(f"[WS] Error for case {case_id}: {e}")
    finally:
        if pubsub:
            await pubsub.unsubscribe(f"case_progress:{case_id}")
        if redis_client:
            await redis_client.close()
        manager.disconnect(case_id, websocket)
