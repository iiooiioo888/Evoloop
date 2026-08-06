"""OPC UA 浏览操作 Mixin。"""

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
        """浏览服务器节点树。

        Returns:
            [{"tag_name": ..., "node_id": ..., "data_type": ...,
              "value": ..., "writable": ..., "description": ...}, ...]
        """
        client = await self._ensure_connected()
        root = (
            client.get_objects_node()
            if path == "Objects"
            else client.get_node(path)
        )
        tags = []
        for child in await root.get_children():
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
            tags.append(
                {
                    "tag_name": display_name,
                    "node_id": child.nodeid.to_string(),
                    "data_type": "",
                    "value": val,
                    "writable": writable,
                    "description": (
                        await child.read_description()
                    ).Text
                    or "",
                }
            )
        return tags