"""OPC 路由 — 健康检查。"""

from fastapi import APIRouter

from opc_service.client import opc_client
from opc_service.config import settings

router = APIRouter(tags=["OPC 健康检查"])


@router.get("/health")
async def health():
    """检查 OPC UA 连接状态。"""
    connected = opc_client.connected
    return {
        "status": "ok" if connected else "degraded",
        "opc_connected": connected,
        "opc_server": settings.opc_server_url,
    }