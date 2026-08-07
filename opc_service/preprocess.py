"""OPC 预处理节点 — 数据清洗、品质过滤、标准化。

对原始传感器读数进行预处理：
- 滤除品质不良（Bad/Uncertain）的读数
- 检测缺失传感器
- 标准化数值格式
- 产出品质报告
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)

# 可接受的品质等级
GOOD_QUALITIES = {"Good", "GoodLocalOverride", "GoodClamped"}


def _filter_bad_quality(
    readings: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    """过滤品质不良的读数。

    Returns:
        (clean_readings, bad_tags): 清洁读数与不良标签列表
    """
    clean: dict[str, Any] = {}
    bad: list[str] = []
    for name, info in readings.items():
        quality = str(info.get("quality", "Good"))
        if quality in GOOD_QUALITIES:
            clean[name] = info
        else:
            bad.append(name)
            logger.debug("OPC 预处理：标签 %s 品质 %s，已过滤", name, quality)
    return clean, bad


def _validate_readings(
    readings: dict[str, Any],
) -> dict[str, Any]:
    """标准化并验证读数格式。

    确保每个读数包含 value/data_type/quality 三个字段，
    缺失字段用默认值填充。
    """
    validated: dict[str, Any] = {}
    for name, info in readings.items():
        if not isinstance(info, dict):
            validated[name] = {"value": info, "data_type": "", "quality": "Unknown"}
            continue
        validated[name] = {
            "value": info.get("value"),
            "data_type": str(info.get("data_type", "")),
            "quality": str(info.get("quality", "Good")),
        }
    return validated


async def preprocess_opc(state: dict) -> dict[str, Any]:
    """节点 P1：预处理原始 OPC 读数。

    从 state.opc_readings 读取原始数据，执行：
    1. 品质过滤 — 移除 Bad/Uncertain 读数
    2. 格式标准化 — 确保所有字段存在
    3. 产出品质报告

    若无读数数据，返回空结果。
    """
    readings = state.get("opc_readings") or {}
    if not readings:
        return {
            "opc_readings_clean": {},
            "opc_quality_report": {"total": 0, "good": 0, "bad": 0, "bad_tags": []},
        }

    clean, bad_tags = _filter_bad_quality(readings)
    validated = _validate_readings(clean)

    quality_report = {
        "total": len(readings),
        "good": len(validated),
        "bad": len(bad_tags),
        "bad_tags": bad_tags,
    }

    if bad_tags:
        logger.info(
            "OPC 预处理：%d 个标签品质不良已过滤：%s",
            len(bad_tags),
            ", ".join(bad_tags),
        )

    return {
        "opc_readings_clean": validated,
        "opc_quality_report": quality_report,
    }