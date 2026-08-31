"""動態反思閾值（核心邏輯層優化）。

依任務複雜度與歷史表現自適應調整 PASS_THRESHOLD，
避免對簡單任務過度反思，同時對複雜任務維持較高品質門檻。

規則：
- 短查詢（< 80 字）且無複雜關鍵詞 → 降低門檻（預設 -0.5）
- 長查詢（≥ 200 字）或含開發/架構關鍵詞 → 維持或提高門檻
- 近期 simple 路由低分率高 → 略提高門檻（更嚴格）
"""

from __future__ import annotations

import logging
import os
import re

logger = logging.getLogger(__name__)

_BASE_THRESHOLD = float(os.getenv("EVOL_PASS_THRESHOLD", "8"))
_SIMPLE_BIAS = float(os.getenv("EVOL_THRESHOLD_SIMPLE_BIAS", "-0.5"))
_COMPLEX_BIAS = float(os.getenv("EVOL_THRESHOLD_COMPLEX_BIAS", "0.3"))
_MIN_THRESHOLD = float(os.getenv("EVOL_THRESHOLD_MIN", "6.5"))
_MAX_THRESHOLD = float(os.getenv("EVOL_THRESHOLD_MAX", "9.0"))

_COMPLEX_KEYWORDS = re.compile(
    r"(开发|設計|设计|构建|實現|实现|建立|打造|完整|系統|系统|專案|项目|"
    r"多步|架構|架构|重构|遷移|迁移|deploy|develop|build|implement|design|"
    r"create|refactor|migrate|project|system|application)",
    re.IGNORECASE,
)


def _clamp(value: float) -> float:
    return max(_MIN_THRESHOLD, min(_MAX_THRESHOLD, round(value, 2)))


def _complexity_bias(query: str) -> float:
    """依查詢複雜度計算門檻偏移。"""
    length = len(query or "")
    if length < 80 and not _COMPLEX_KEYWORDS.search(query or ""):
        return _SIMPLE_BIAS
    if length >= 200 or _COMPLEX_KEYWORDS.search(query or ""):
        return _COMPLEX_BIAS
    return 0.0


def _history_bias() -> float:
    """依路由反饋歷史微調門檻（simple 低分過多 → 略嚴）。"""
    try:
        from backend.core.routing_feedback import routing_stats

        stats = routing_stats()
        if stats.get("total", 0) < 10:
            return 0.0
        simple_avg = float(stats.get("simple_avg_score", 0))
        if simple_avg < 6.5:
            return 0.2
        if simple_avg >= 8.5:
            return -0.1
    except Exception:
        pass
    return 0.0


def _feedback_bias() -> float:
    """依用戶滿意度微調門檻。"""
    try:
        from backend.core.user_feedback import satisfaction_bias

        return satisfaction_bias()
    except Exception:
        return 0.0


def resolve_pass_threshold(query: str = "") -> float:
    """計算當前任務的自適應通過門檻。"""
    threshold = (
        _BASE_THRESHOLD
        + _complexity_bias(query)
        + _history_bias()
        + _feedback_bias()
    )
    resolved = _clamp(threshold)
    logger.debug(
        "動態閾值：base=%.1f query_len=%d → %.1f",
        _BASE_THRESHOLD,
        len(query or ""),
        resolved,
    )
    return resolved


def threshold_config() -> dict[str, float]:
    """供監控面板使用的配置摘要。"""
    return {
        "base": _BASE_THRESHOLD,
        "simple_bias": _SIMPLE_BIAS,
        "complex_bias": _COMPLEX_BIAS,
        "min": _MIN_THRESHOLD,
        "max": _MAX_THRESHOLD,
    }
