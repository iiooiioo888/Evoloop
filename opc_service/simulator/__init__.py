"""模拟 OPC UA 服务器 — 模块级单例管理。

提供 start_simulator / get_simulator 两个公开 API。
"""

from opc_service.simulator.server import SimulatedOPCServer

# 模块级单例
_sim_server: SimulatedOPCServer | None = None


async def start_simulator() -> SimulatedOPCServer:
    """启动模拟 OPC UA 服务器（单例）。"""
    global _sim_server
    if _sim_server is None:
        _sim_server = SimulatedOPCServer()
        await _sim_server.start()
    return _sim_server


async def get_simulator() -> SimulatedOPCServer | None:
    """获取模拟服务器实例（若未启动返回 None）。"""
    return _sim_server


__all__ = ["SimulatedOPCServer", "get_simulator", "start_simulator"]