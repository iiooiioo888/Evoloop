"""模拟 OPC UA 服务器 — 异常场景模拟。

提供多种工业异常场景的触发与回放能力。
"""

import asyncio
import logging

logger = logging.getLogger(__name__)


async def trigger_anomaly(
    server, scenario: str = "overheat"
) -> None:
    """触发模拟异常场景。

    支持的场景：
    - overheat: 温度逐步升高至超标（> 120°C）
    - pressure_spike: 压力骤升（> 400 kPa）
    - flow_loss: 流量骤降（< 10 L/min）
    """
    logger.info("触发异常场景：%s", scenario)

    if scenario == "overheat":
        for i in range(20):
            server.values["Temperature"] = min(
                150.0, 25.0 + i * 7.0
            )
            if server.values["Temperature"] > 100:
                server.values["AlarmStatus"] = 1.0
            await asyncio.sleep(0.5)

    elif scenario == "pressure_spike":
        for i in range(10):
            server.values["Pressure"] = min(
                500.0, 101.3 + i * 40.0
            )
            if server.values["Pressure"] > 300:
                server.values["AlarmStatus"] = 1.0
            await asyncio.sleep(0.5)

    elif scenario == "flow_loss":
        for i in range(20):
            server.values["FlowRate"] = max(0.0, 50.0 - i * 3.0)
            if server.values["FlowRate"] < 15:
                server.values["AlarmStatus"] = 1.0
            await asyncio.sleep(0.5)

    logger.info("异常场景 %s 已结束", scenario)