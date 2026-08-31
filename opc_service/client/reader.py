"""OPC UA 读取操作 Mixin。"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from asyncua import ua

from opc_service.client.nodes import node_id_for_tag, short_tag_name

if TYPE_CHECKING:
    from asyncua import Client

logger = logging.getLogger(__name__)


class ReaderMixin:
    """OPC UA 标签读取 — read_node / read_nodes。"""

    if TYPE_CHECKING:
        # 由 ConnectionMixin 在 OPCClient 组合时提供
        async def _ensure_connected(self) -> "Client": ...

    async def read_node(
        self, tag_name: str, node_id: str | None = None
    ) -> dict[str, Any]:
        """读取指定标签的当前值。

        Returns:
            {"tag_name": ..., "value": ..., "data_type": ...,
             "source_timestamp": ..., "quality": ...}
        """
        client = await self._ensure_connected()
        resolved = node_id_for_tag(tag_name, node_id)
        short = short_tag_name(tag_name, node_id)
        try:
            node = client.get_node(resolved)
            val = await node.read_value()
            dt = await node.read_data_type_as_variant_type()
            return {
                "tag_name": short,
                "value": val,
                "data_type": dt.name if hasattr(dt, "name") else str(dt),
                "source_timestamp": datetime.now(timezone.utc),
                "quality": "Good",
            }
        except ua.UaStatusCodeError:
            logger.warning("读取失败，节点不存在：%s", resolved)
            return {
                "tag_name": short,
                "value": None,
                "data_type": "",
                "source_timestamp": None,
                "quality": "Bad",
            }

    async def read_nodes(
        self,
        tag_names: list[str],
        node_ids: list[str | None] | None = None,
    ) -> list[dict[str, Any]]:
        """批量读取多个标签（并发执行）。
        
        使用 asyncio.gather() 并发读取所有标签，显著提升多标签读取性能。
        """
        if not tag_names:
            return []
        ids = node_ids or [None] * len(tag_names)
        tasks = [
            self.read_node(name, nid) for name, nid in zip(tag_names, ids, strict=False)
        ]
        return await asyncio.gather(*tasks)