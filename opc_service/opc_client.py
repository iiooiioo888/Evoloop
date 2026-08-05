"""OPC UA 客户端 — 兼容重导出。

客户端实现已拆分至 opc_service/client/ 子包（Mixin 组合）。
此文件保留以兼容旧导入路径。
"""

from opc_service.client import OPCClient, opc_client

__all__ = ["OPCClient", "opc_client"]