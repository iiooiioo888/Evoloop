"""OPC 诊断节点 — 使用 LLM 分析预处理数据并诊断异常。

6 级闭环中的第 4 级：接收预处理后的传感器读数与统计分析结果，
由 LLM 进行深度诊断，产出异常检测、根因分析与建议动作。
"""

import json
import logging
from typing import Any

from backend.core.llm import call_llm, parse_json_response
from opc_service.prompts import DIAGNOSE_OPC, DIAGNOSE_OPC_SYSTEM

logger = logging.getLogger(__name__)


async def diagnose_opc(state: dict) -> dict[str, Any]:
    """节点 Dg1：使用 LLM 分析预处理后的读数与统计结果，进行深度诊断。

    从 state.opc_readings_clean 读取预处理数据，
    从 state.opc_analysis 读取统计分析结果，
    由 LLM 产出异常检测、根因分析与建议动作。

    无清洁读数时跳过诊断。
    """
    readings = state.get("opc_readings_clean") or {}
    analysis = state.get("opc_analysis") or {}

    if not readings:
        return {
            "opc_diagnosis": {
                "anomaly_detected": False,
                "severity": "normal",
                "analysis": "无有效传感器读数",
                "root_cause": "",
                "suggested_actions": [],
            },
            "opc_anomaly_detected": False,
        }

    # 格式化读数为文字
    readings_text = "\n".join(
        f"- {name}: {info.get('value', 'N/A')} "
        f"(品质: {info.get('quality', 'Unknown')})"
        for name, info in readings.items()
    )

    # 格式化分析结果为文字
    analysis_text = analysis.get("summary", "无统计分析结果")
    violations = analysis.get("violations", [])
    if violations:
        violation_text = "\n".join(
            f"  - {v['tag']}: {v['value']} "
            f"（阈值 {v['threshold']}，方向 {v['direction']}，"
            f"严重度 {v['severity']}）"
            for v in violations
        )
        analysis_text += f"\n阈值违规：\n{violation_text}"

    prompt = DIAGNOSE_OPC.format(
        readings=readings_text,
        analysis=analysis_text,
        query=state.get("query", "请检查工业制程是否有异常"),
    )
    raw = call_llm(prompt, system=DIAGNOSE_OPC_SYSTEM)

    try:
        result = parse_json_response(raw)
    except json.JSONDecodeError:
        logger.warning("OPC 诊断结果解析失败：%s", raw)
        return {
            "opc_diagnosis": {
                "anomaly_detected": False,
                "severity": "normal",
                "analysis": "诊断解析失败",
                "root_cause": "",
                "suggested_actions": [],
            },
            "opc_anomaly_detected": False,
        }

    anomaly = result.get("anomaly_detected", False)
    severity = result.get("severity", "normal")
    suggested_actions = result.get("suggested_actions", [])

    diagnosis = {
        "anomaly_detected": anomaly,
        "severity": severity,
        "analysis": result.get("analysis", ""),
        "root_cause": result.get("root_cause", ""),
        "suggested_actions": suggested_actions,
    }

    # 将诊断分析注入 current_answer 供后续反思使用
    answer_text = (
        f"【OPC 工业诊断（6 级闭环）】\n"
        f"异常检测：{'是' if anomaly else '否'}\n"
        f"严重程度：{severity}\n"
        f"分析：{result.get('analysis', '无')}\n"
        f"根因：{result.get('root_cause', '无')}\n"
    )
    if suggested_actions:
        answer_text += f"建议动作：{len(suggested_actions)} 个\n"

    if anomaly:
        logger.info(
            "OPC 诊断：检测到异常，严重程度=%s，建议 %d 个动作",
            severity,
            len(suggested_actions),
        )

    return {
        "opc_diagnosis": diagnosis,
        "opc_anomaly_detected": anomaly,
        "current_answer": answer_text,
    }