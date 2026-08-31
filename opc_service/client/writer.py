"""OPC UA 写入操作 Mixin。"""

import asyncio
import logging
from typing import TYPE_CHECKING, Any

from asyncua import ua

from opc_service.client.nodes import node_id_for_tag, short_tag_name

if TYPE_CHECKING:
    from asyncua import Client

logger = logging.getLogger(__name__)


class WriterMixin:
    """OPC UA 标签写入 — write_node / write_nodes。"""

    if TYPE_CHECKING:
        # 由 ConnectionMixin 在 OPCClient 组合时提供
        async def _ensure_connected(self) -> "Client": ...

    async def write_node(self, tag_name: str, value: float) -> dict[str, Any]:
        """写入标签值。

        Returns:
            {"tag_name": ..., "success": bool, "message": ...,
             "written_value": ...}
        """
        client = await self._ensure_connected()
        short = short_tag_name(tag_name)
        resolved = node_id_for_tag(tag_name)
        try:
            node = client.get_node(resolved)
            dv = ua.DataValue(ua.Variant(value, ua.VariantType.Double))
            await node.write_value(dv)
            return {
                "tag_name": short,
                "success": True,
                "message": "写入成功",
                "written_value": value,
            }
        except ua.UaStatusCodeError as exc:
            return {
                "tag_name": short,
                "success": False,
                "message": f"写入失败：{exc}",
                "written_value": None,
            }

    async def write_nodes(
        self, entries: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """批量写入多个标签（并发执行）。
        
        Args:
            entries: [{"tag_name": ..., "value": ...}, ...]
            
        Returns:
            [{"tag_name": ..., "success": bool, "message": ...}, ...]
            
        使用 asyncio.gather() 并发写入所有标签，显著提升多标签写入性能。
        每个标签独立处理，单项失败不影响其余写入。
        """
        if not entries:
            return []
        # 并发写入所有标签
        tasks = [
            self.write_node(entry["tag_name"], entry["value"]) for entry in entries
        ]
        return await asyncio.gather(*tasks)