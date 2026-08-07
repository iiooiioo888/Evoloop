"""OPC 分析节点 — 统计分析与趋势检测。

基于规则的计算分析（不调用 LLM），对预处理后的数据执行：
- 基本统计（最小值/最大值/均值/标准差）
- 阈值违规检测（基于预设安全范围）
- 趋势方向判断（基于历史数据对比）
- 异常标签标记
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)

# 预设安全阈值范围（可通过环境变量覆盖）
DEFAULT_THRESHOLDS: dict[str, dict[str, float]] = {
    "Temperature": {"low": 0.0, "high": 90.0},
    "Pressure": {"low": 0.0, "high": 200.0},
    "FlowRate": {"low": 0.0, "high": 100.0},
    "ValvePosition": {"low": 0.0, "high": 100.0},
    "MotorSpeed": {"low": 0.0, "high": 3000.0},
    "Level": {"low": 0.0, "high": 100.0},
    "PowerConsumption": {"low": 0.0, "high": 500.0},
}


def _compute_stats(values: list[float]) -> dict[str, float]:
    """计算基本统计量。"""
    if not values:
        return {"min": 0.0, "max": 0.0, "avg": 0.0, "std": 0.0, "count": 0}
    n = len(values)
    avg = sum(values) / n
    variance = sum((v - avg) ** 2 for v in values) / n
    return {
        "min": min(values),
        "max": max(values),
        "avg": round(avg, 3),
        "std": round(variance ** 0.5, 3),
        "count": n,
    }


def _check_thresholds(
    readings: dict[str, Any],
) -> list[dict[str, Any]]:
    """检测阈值违规。

    Returns:
        [{"tag": ..., "value": ..., "threshold": ..., "direction": "high"/"low"}, ...]
    """
    violations: list[dict[str, Any]] = []
    for name, info in readings.items():
        value = info.get("value")
        if not isinstance(value, (int, float)):
            continue
        thresholds = DEFAULT_THRESHOLDS.get(name)
        if thresholds is None:
            continue
        if value > thresholds["high"]:
            violations.append({
                "tag": name,
                "value": value,
                "threshold": thresholds["high"],
                "direction": "high",
                "severity": "critical" if value > thresholds["high"] * 1.2 else "warning",
            })
        elif value < thresholds["low"]:
            violations.append({
                "tag": name,
                "value": value,
                "threshold": thresholds["low"],
                "direction": "low",
                "severity": "critical" if value < thresholds["low"] * 0.8 else "warning",
            })
    return violations


def _detect_trends(
    readings: dict[str, Any],
    history: dict[str, list[float]] | None = None,
) -> dict[str, str]:
    """检测趋势方向（基于当前值与历史均值对比）。

    若无历史数据，返回空字典。
    """
    if not history:
        return {}
    trends: dict[str, str] = {}
    for name, info in readings.items():
        value = info.get("value")
        if not isinstance(value, (int, float)):
            continue
        past = history.get(name)
        if not past:
            continue
        avg_past = sum(past) / len(past)
        if value > avg_past * 1.1:
            trends[name] = "rising"
        elif value < avg_past * 0.9:
            trends[name] = "falling"
        else:
            trends[name] = "stable"
    return trends


async def analyze_opc(state: dict) -> dict[str, Any]:
    """节点 A1：统计分析预处理后的 OPC 读数。

    从 state.opc_readings_clean 读取预处理数据，执行：
    1. 基本统计计算
    2. 阈值违规检测
    3. 趋势分析（如有历史数据）

    无清洁读数时返回空分析结果。
    """
    readings = state.get("opc_readings_clean") or {}
    if not readings:
        return {
            "opc_analysis": {
                "stats": {},
                "violations": [],
                "trends": {},
                "anomaly_tags": [],
                "summary": "无有效传感器读数",
            },
        }

    # 提取数值型读数
    numeric_values = [
        info["value"]
        for info in readings.values()
        if isinstance(info.get("value"), (int, float))
    ]

    stats = _compute_stats(numeric_values)
    violations = _check_thresholds(readings)
    trends = _detect_trends(readings, state.get("opc_history"))

    anomaly_tags = [v["tag"] for v in violations]
    if violations:
        logger.info(
            "OPC 分析：检测到 %d 个阈值违规：%s",
            len(violations),
            ", ".join(anomaly_tags),
        )

    # 生成摘要
    if violations:
        summary_parts = [f"{v['tag']}={v['value']}（{v['direction']}）" for v in violations]
        summary = f"阈值违规：{'; '.join(summary_parts)}"
    else:
        summary = "所有读数在安全范围内"

    return {
        "opc_analysis": {
            "stats": stats,
            "violations": violations,
            "trends": trends,
            "anomaly_tags": anomaly_tags,
            "summary": summary,
        },
    }