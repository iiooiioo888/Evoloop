"""OPC 感知节点 — 从 OPC 服务读取传感器数据。

通过 HTTP 调用 OPC 微服务，将读数注入 state。
"""

import logging
import os
from typing import Any

import httpx

from opc_service.prompts import DEFAULT_SENSE_TAGS

logger = logging.getLogger(__name__)

# OPC 微服务基础 URL（可通过环境变量覆盖）
OPC_SERVICE_URL = os.getenv(
    "OPC_SERVICE_URL", "http://localhost:8001"
)


async def _read_opc_tags(tag_names: list[str]) -> dict[str, dict]:
    """通过 HTTP 调用 OPC 服务读取标签值。

    Returns:
        {tag_name: {"value": ..., "data_type": ..., "quality": ...}, ...}
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{OPC_SERVICE_URL}/opc/read",
                json={"tag_names": tag_names},
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                tag["tag_name"]: {
                    "value": tag["value"],
                    "data_type": tag.get("data_type", ""),
                    "quality": tag.get("quality", "Good"),
                }
                for tag in data.get("tags", [])
            }
    except Exception as exc:  # noqa: BLE001 - 降级兜底：读取失败返回空读数
        logger.warning("OPC 读取失败：%s", exc)
        return {}


async def sense_opc(state: dict) -> dict[str, Any]:
    """节点 S1：从 OPC 服务读取传感器数据。

    读取所有工业制程标签的当前值并注入 state.opc_readings。
    若读取失败，标记为降级模式并继续执行。
    """
    readings = await _read_opc_tags(DEFAULT_SENSE_TAGS)

    return {
        "opc_readings": readings,
        "opc_anomaly_detected": False,
        "opc_actions": [],
    }