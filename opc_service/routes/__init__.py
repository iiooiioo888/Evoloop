"""OPC 服务 API 路由 — 聚合所有子路由为单一 APIRouter。

提供：
- GET  /health         健康检查
- GET  /tags           列出所有可用标签
- POST /read           读取标签值
- POST /write          写入标签值（含安全护栏检查）
- POST /browse         浏览 OPC UA 节点树
- WS   /ws/subscribe   WebSocket 订阅标签变更
"""

from fastapi import APIRouter

from opc_service.routes import browse, health, read, write, ws

router = APIRouter(prefix="/opc")

router.include_router(health.router)
router.include_router(read.router)
router.include_router(write.router)
router.include_router(browse.router)
router.include_router(ws.router)