"""用戶反饋閉環（策略層優化）。

收集顯式反饋（點讚/點踩）與隱式信號（複製、編輯），
供路由自適應與動態閾值調整使用。
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Literal

logger = logging.getLogger(__name__)

FeedbackSignal = Literal["thumbs_up", "thumbs_down", "copy", "edit"]

_DEFAULT_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "user_feedback.json"
)
_FEEDBACK_PATH = Path(os.getenv("EVOL_USER_FEEDBACK_PATH", str(_DEFAULT_PATH)))
_MAX_RECORDS = int(os.getenv("EVOL_USER_FEEDBACK_MAX", "500"))


def _ensure_store() -> dict[str, Any]:
    if _FEEDBACK_PATH.exists():
        try:
            with open(_FEEDBACK_PATH, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "records" in data:
                return data
        except Exception as exc:
            logger.warning("讀取用戶反饋失敗：%s", exc)
    return {"records": [], "stats": {"thumbs_up": 0, "thumbs_down": 0, "copy": 0, "edit": 0}}


def _save_store(data: dict[str, Any]) -> None:
    _FEEDBACK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_FEEDBACK_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def record_feedback(
    *,
    session_id: str,
    signal: FeedbackSignal,
    score: float | None = None,
    query_length: int = 0,
    comment: str = "",
) -> dict[str, Any]:
    """記錄一筆用戶反饋。"""
    store = _ensure_store()
    records: list[dict[str, Any]] = store.setdefault("records", [])
    entry = {
        "session_id": session_id,
        "signal": signal,
        "score": round(score, 2) if score is not None else None,
        "query_length": query_length,
        "comment": (comment or "")[:500],
    }
    records.append(entry)
    if len(records) > _MAX_RECORDS:
        store["records"] = records[-_MAX_RECORDS:]
    stats = store.setdefault("stats", {})
    stats[signal] = int(stats.get(signal, 0)) + 1
    _save_store(store)
    return entry


def feedback_stats() -> dict[str, Any]:
    """回傳反饋統計摘要。"""
    store = _ensure_store()
    records = store.get("records", [])
    stats = store.get("stats", {})
    positive = int(stats.get("thumbs_up", 0))
    negative = int(stats.get("thumbs_down", 0))
    total_rated = positive + negative
    satisfaction = round(positive / total_rated, 4) if total_rated else 0.0
    return {
        "total": len(records),
        "stats": stats,
        "satisfaction_rate": satisfaction,
        "recent": records[-5:],
    }


def satisfaction_bias() -> float:
    """依滿意度微調反思門檻（滿意度低 → 略嚴）。"""
    stats = feedback_stats()
    rate = float(stats.get("satisfaction_rate", 0))
    if stats.get("total", 0) < 5:
        return 0.0
    if rate < 0.6:
        return 0.15
    if rate > 0.85:
        return -0.1
    return 0.0
