"""OPC 执行节点 — 根据诊断结果执行控制动作。

将 LLM 建议的控制动作写入 OPC 服务，并记录执行结果。
"""

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# OPC 微服务基础 URL（可通过环境变量覆盖）
OPC_SERVICE_URL = os.getenv(
    "OPC_SERVICE_URL", "http://localhost:8001"
)


async def _write_opc_tags(
    entries: list[dict], reason: str = ""
) -> list[dict]:
    """通过 HTTP 调用 OPC 服务写入标签值。

    Args:
        entries: [{"tag_name": ..., "value": ...}, ...]
        reason: 操作原因（审计用）

    Returns:
        [{"tag_name": ..., "success": bool, "message": ...}, ...]
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{OPC_SERVICE_URL}/opc/write",
                json={"entries": entries, "reason": reason},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("results", [])
    except Exception as exc:  # noqa: BLE001 - 降级兜底：写入失败返回逐项失败结果
        logger.warning("OPC 写入失败：%s", exc)
        return [
            {
                "tag_name": e["tag_name"],
                "success": False,
                "message": str(exc),
            }
            for e in entries
        ]


async def act_opc(state: dict) -> dict[str, Any]:
    """节点 S3：根据诊断结果执行控制动作。

    将 LLM 建议的控制动作写入 OPC 服务，并记录执行结果。
    安全护栏在 OPC 服务端执行（白名单 + 边界检查）。
    """
    actions = state.get("opc_actions") or []
    if not actions:
        return {}

    reason = (
        f"EvoLoop 自动诊断建议"
        f"（session: {state.get('session_id', 'unknown')}）"
    )
    results = await _write_opc_tags(actions, reason=reason)

    success_count = sum(1 for r in results if r.get("success"))
    logger.info(
        "OPC 控制动作执行完成：%d/%d 成功",
        success_count,
        len(results),
    )

    return {"opc_actions": results}