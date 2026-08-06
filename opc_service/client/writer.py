"""OPC UA 写入操作 Mixin。"""

import logging
from typing import TYPE_CHECKING, Any

from asyncua import ua

if TYPE_CHECKING:
    from asyncua import Client

logger = logging.getLogger(__name__)


class WriterMixin:
    """OPC UA 标签写入 — write_node。"""

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
        node_id = f"ns=2;s={tag_name}"
        try:
            node = client.get_node(node_id)
            dv = ua.DataValue(ua.Variant(value, ua.VariantType.Double))
            await node.write_value(dv)
            return {
                "tag_name": tag_name,
                "success": True,
                "message": "写入成功",
                "written_value": value,
            }
        except ua.UaStatusCodeError as exc:
            return {
                "tag_name": tag_name,
                "success": False,
                "message": f"写入失败：{exc}",
                "written_value": None,
            }