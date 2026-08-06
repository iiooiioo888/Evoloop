"""OPC UA 订阅操作 Mixin。"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from asyncua import Node
from asyncua.common.subscription import (
    DataChangeNotif,
    DataChangeNotificationHandler,
)

if TYPE_CHECKING:
    from asyncua import Client

logger = logging.getLogger(__name__)


class OPCSubscriptionHandler(DataChangeNotificationHandler):
    """订阅回调处理器：将数据变更推入异步队列。"""

    def __init__(self, queue: asyncio.Queue):
        super().__init__()
        self.queue = queue

    def datachange_notification(
        self, node: Node, val: Any, data: DataChangeNotif
    ):
        """标签值变更时，将事件推入队列。"""
        try:
            event = {
                "node_id": node.nodeid.to_string(),
                "value": val,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": (
                    str(data.monitored_item.Value.StatusCode.name)
                    if data.monitored_item.Value.StatusCode
                    else "Good"
                ),
            }
            asyncio.ensure_future(self.queue.put(event))
        except Exception:
            logger.exception("订阅回调处理失败")


class SubscriberMixin:
    """OPC UA 订阅管理 — subscribe。"""

    if TYPE_CHECKING:
        # 由 ConnectionMixin 在 OPCClient 组合时提供
        async def _ensure_connected(self) -> "Client": ...

    def __init_subscriptions__(self) -> None:
        """初始化订阅字典（由 __init__ 调用）。"""
        self._subscriptions: dict[str, OPCSubscriptionHandler] = {}

    async def subscribe(
        self, tag_names: list[str], queue: asyncio.Queue
    ) -> OPCSubscriptionHandler:
        """订阅多个标签的数据变更，变更事件推入 queue。"""
        client = await self._ensure_connected()
        handler = OPCSubscriptionHandler(queue)
        sub = await client.create_subscription(period=500, handler=handler)
        nodes = [
            client.get_node(f"ns=2;s={name}") for name in tag_names
        ]
        await sub.subscribe_data_change(nodes)
        for name in tag_names:
            self._subscriptions[name] = handler
        logger.info("已订阅标签：%s", tag_names)
        return handler