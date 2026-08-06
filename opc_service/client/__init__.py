"""OPC UA 异步客户端 — 门面类 + 模块级单例。

通过 Mixin 组合连接、读取、写入、浏览、订阅五类能力。
"""

from opc_service.client.browser import BrowserMixin
from opc_service.client.connection import ConnectionMixin
from opc_service.client.reader import ReaderMixin
from opc_service.client.subscriber import SubscriberMixin
from opc_service.client.writer import WriterMixin


class OPCClient(
    ConnectionMixin,
    ReaderMixin,
    WriterMixin,
    BrowserMixin,
    SubscriberMixin,
):
    """OPC UA 异步客户端封装。

    支持自动重连与惰性初始化，所有公开方法均为异步。
    """

    def __init__(self, url: str | None = None) -> None:
        ConnectionMixin.__init__(self, url=url)
        self.__init_subscriptions__()


# 模块级单例，供 FastAPI 路由共用
opc_client = OPCClient()

__all__ = ["OPCClient", "opc_client"]