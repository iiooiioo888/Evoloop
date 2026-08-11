"""OPC UA 浏览操作 Mixin。"""

import asyncio
import logging
from typing import TYPE_CHECKING, Any

from asyncua import ua

if TYPE_CHECKING:
    from asyncua import Client

logger = logging.getLogger(__name__)


class BrowserMixin:
    """OPC UA 节点浏览 — browse_nodes。"""

    if TYPE_CHECKING:
        # 由 ConnectionMixin 在 OPCClient 组合时提供
        async def _ensure_connected(self) -> "Client": ...

    async def browse_nodes(self, path: str = "Objects") -> list[dict[str, Any]]:
        """浏览服务器节点树（并发读取子节点属性）。

        Returns:
            [{"tag_name": ..., "node_id": ..., "data_type": ...,
              "value": ..., "writable": ..., "description": ...}, ...]
        
        性能优化：使用 asyncio.gather() 并发读取各子节点的属性，
        显著提升多节点浏览性能。
        """
        client = await self._ensure_connected()
        root = (
            client.get_objects_node()
            if path == "Objects"
            else client.get_node(path)
        )
        tags = []
        children = await root.get_children()
        
        # 并发处理所有子节点
        async def process_child(child):
            display_name = (await child.read_display_name()).Text
            try:
                val = await child.read_value()
            except ua.UaError:
                val = None
            try:
                access = await child.get_access_level()
                # get_access_level 返回 AccessLevel 集合，用成员判断代替位与
                writable = ua.AccessLevel.CurrentWrite in access
            except ua.UaError:
                writable = False
            try:
                desc = (await child.read_description()).Text or ""
            except ua.UaError:
                desc = ""
            return {
                "tag_name": display_name,
                "node_id": child.nodeid.to_string(),
                "data_type": "",
                "value": val,
                "writable": writable,
                "description": desc,
            }
        
        # 并发处理所有子节点
        tasks = [process_child(child) for child in children]
        if tasks:
            tags = await asyncio.gather(*tasks)
        
        return list(tags)