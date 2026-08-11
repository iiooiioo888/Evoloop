"""OPC UA 读取操作 Mixin。"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from asyncua import ua

if TYPE_CHECKING:
    from asyncua import Client

logger = logging.getLogger(__name__)


class ReaderMixin:
    """OPC UA 标签读取 — read_node / read_nodes。"""

    if TYPE_CHECKING:
        # 由 ConnectionMixin 在 OPCClient 组合时提供
        async def _ensure_connected(self) -> "Client": ...

    async def read_node(self, tag_name: str) -> dict[str, Any]:
        """读取指定标签的当前值。

        Returns:
            {"tag_name": ..., "value": ..., "data_type": ...,
             "source_timestamp": ..., "quality": ...}
        """
        client = await self._ensure_connected()
        node_id = f"ns=2;s={tag_name}"
        try:
            node = client.get_node(node_id)
            val = await node.read_value()
            dt = await node.read_data_type_as_variant_type()
            return {
                "tag_name": tag_name,
                "value": val,
                "data_type": dt.name if hasattr(dt, "name") else str(dt),
                "source_timestamp": datetime.now(timezone.utc),
                "quality": "Good",
            }
        except ua.UaStatusCodeError:
            logger.warning("读取失败，节点不存在：%s", node_id)
            return {
                "tag_name": tag_name,
                "value": None,
                "data_type": "",
                "source_timestamp": None,
                "quality": "Bad",
            }

    async def read_nodes(self, tag_names: list[str]) -> list[dict[str, Any]]:
        """批量读取多个标签（并发执行）。
        
        使用 asyncio.gather() 并发读取所有标签，显著提升多标签读取性能。
        """
        if not tag_names:
            return []
        # 并发读取所有标签
        tasks = [self.read_node(name) for name in tag_names]
        return await asyncio.gather(*tasks)