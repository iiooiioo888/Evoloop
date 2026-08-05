"""OPC 工业数据微服务入口。

启动方式：
    # 仅启动 API（连接外部 OPC 服务器）
    python -m opc_service.main

    # 同时启动模拟 OPC 服务器 + API（开发测试用）
    OPC_SIM_ENABLED=true python -m opc_service.main

    # 使用 uvicorn
    uvicorn opc_service.app:app --host 0.0.0.0 --port 8001 --reload
"""

import logging

from opc_service.app import app  # noqa: F401 — 兼容旧导入路径
from opc_service.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "opc_service.app:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )