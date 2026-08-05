"""OPC UA 连接管理 Mixin。

提供连接/断开/重连与锁管理，作为 OPCClient 的基类之一。
"""

import asyncio
import logging

from asyncua import Client

from opc_service.config import settings

logger = logging.getLogger(__name__)


class ConnectionMixin:
    """OPC UA 连接管理 — 建立/断开/自动重连与线程安全锁。"""

    def __init__(self, url: str | None = None) -> None:
        self._url = url or settings.opc_server_url
        self._client: Client | None = None
        self._lock = asyncio.Lock()

    # ---- 连接状态 ----

    @property
    def connected(self) -> bool:
        return self._client is not None and self._client.uaclient is not None

    # ---- 连接/断开 ----

    async def connect(self) -> None:
        """建立连接（含自动重试）。"""
        async with self._lock:
            if self.connected:
                return
            self._client = Client(url=self._url, timeout=10)
            try:
                await self._client.connect()
                logger.info("已连接至 OPC UA 服务器：%s", self._url)
            except Exception:
                self._client = None
                raise

    async def disconnect(self) -> None:
        """关闭连接。"""
        async with self._lock:
            if self._client:
                try:
                    await self._client.disconnect()
                except Exception:  # 断开阶段的异常不应阻断清理流程
                    logger.debug("断开 OPC UA 连接时的异常已忽略", exc_info=True)
                finally:
                    self._client = None
            logger.info("已断开 OPC UA 连接")

    async def _ensure_connected(self) -> Client:
        """确保连接存在，必要时自动重连。"""
        if not self.connected:
            await self.connect()
        assert self._client is not None
        return self._client