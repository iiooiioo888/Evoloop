"""OPC 诊断节点 — 使用 LLM 分析传感器数据并诊断异常。

将传感器数据格式化后传入 LLM，产出诊断分析与控制建议。
"""

import json
import logging
from typing import Any

from backend.core.llm import call_llm, parse_json_response
from opc_service.prompts import DIAGNOSE_OPC, DIAGNOSE_OPC_SYSTEM

logger = logging.getLogger(__name__)


async def diagnose_opc(state: dict) -> dict[str, Any]:
    """节点 S2：使用 LLM 分析 OPC 读数并诊断异常。

    将传感器数据格式化后传入 LLM，产出诊断分析与控制建议。
    若无读数数据，跳过诊断。
    """
    readings = state.get("opc_readings") or {}
    if not readings:
        return {"opc_anomaly_detected": False, "opc_actions": []}

    # 格式化读数为文字
    readings_text = "\n".join(
        f"- {name}: {info.get('value', 'N/A')} "
        f"(品质: {info.get('quality', 'Unknown')})"
        for name, info in readings.items()
    )

    prompt = DIAGNOSE_OPC.format(
        readings=readings_text,
        query=state.get("query", "请检查工业制程是否有异常"),
    )
    raw = call_llm(prompt, system=DIAGNOSE_OPC_SYSTEM)

    try:
        result = parse_json_response(raw)
    except json.JSONDecodeError:
        logger.warning("OPC 诊断结果解析失败：%s", raw)
        return {"opc_anomaly_detected": False, "opc_actions": []}

    anomaly = result.get("anomaly_detected", False)
    actions = result.get("actions", [])

    # 将诊断分析注入 current_answer 供后续反思使用
    analysis = (
        f"【OPC 工业诊断】\n"
        f"异常检测：{'是' if anomaly else '否'}\n"
        f"分析：{result.get('analysis', '无')}\n"
        f"根因：{result.get('root_cause', '无')}\n"
    )

    return {
        "opc_anomaly_detected": anomaly,
        "opc_actions": actions,
        "current_answer": analysis,
    }