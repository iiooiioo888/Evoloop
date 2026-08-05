"""Task 8.6：文本化存檔服務。

將每次對話的完整生命週期（使用者輸入、生成回答、評估、
反思、改進、最終回答）結構化保存為 JSONL 文本檔案
（每行一個 JSON 物件），供審計、除錯、訓練資料回溯與
系統行為分析使用。

特性：
- 非同步寫入（aiofiles）為主，不阻塞主回應流程；
  另提供同步版本供無事件迴圈的脈絡降級使用
- 以日期分割檔案，避免單一檔案過大
- 存檔目錄可透過環境變數 EVOL_ARCHIVE_DIR 覆蓋（測試隔離）
"""

import json
import logging
import os
from collections.abc import Mapping
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiofiles

from backend.core.llm_config import get_runtime_config

logger = logging.getLogger(__name__)

# 預設存檔目錄：backend/data/archives
DEFAULT_ARCHIVE_DIR = (
    Path(__file__).resolve().parent.parent / "data" / "archives"
)


def _archive_dir() -> Path:
    """每次呼叫時解析存檔目錄，方便測試以環境變數覆蓋。"""
    return Path(os.getenv("EVOL_ARCHIVE_DIR", str(DEFAULT_ARCHIVE_DIR)))


def _archive_file_path() -> Path:
    """當日 JSONL 檔案路徑（以 UTC 日期分割）。"""
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    archive_dir = _archive_dir()
    archive_dir.mkdir(parents=True, exist_ok=True)
    return archive_dir / f"evo_{date_str}.jsonl"


def build_archive_record(state: Mapping[str, Any], session_id: str) -> dict:
    """將 EvoLoopState 映射為存檔記錄結構。"""
    reflections = state.get("reflections") or []
    needs_improvement = len(reflections) > 0

    evaluation = state.get("evaluation") or {}
    if isinstance(evaluation, dict):
        feedback = evaluation.get("weaknesses") or evaluation.get("strengths") or ""
    else:
        feedback = str(evaluation)

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "user_query": state.get("query"),
        "initial_answer": state.get("initial_answer"),
        "evaluation_score": state.get("score"),
        "evaluation_feedback": feedback,
        "needs_improvement": needs_improvement,
        "reflection": reflections if needs_improvement else None,
        "improved_answer": state.get("current_answer") if needs_improvement else None,
        "final_answer": state.get("final_answer"),
        "memory_items": state.get("retrieved_memories") or [],
        "metadata": {
            "model": get_runtime_config().get("model"),
            "iterations": state.get("iteration", 0),
            "memory_saved": state.get("memory_saved", False),
            **(state.get("archive_metadata") or {}),
        },
    }


def _serialize_record(state: Mapping[str, Any], session_id: str) -> str:
    """建構記錄並序列化為單行 JSON 文字。"""
    record = build_archive_record(state, session_id)
    return json.dumps(record, ensure_ascii=False) + "\n"


async def save_session_archive(state: Mapping[str, Any], session_id: str) -> Path:
    """將對話狀態以非同步方式寫入當日 JSONL 檔案。"""
    line = _serialize_record(state, session_id)
    file_path = _archive_file_path()
    async with aiofiles.open(file_path, mode="a", encoding="utf-8") as f:
        await f.write(line)
    return file_path


def save_session_archive_sync(state: Mapping[str, Any], session_id: str) -> Path:
    """同步版本存檔，供無事件迴圈或降級情境使用。"""
    line = _serialize_record(state, session_id)
    file_path = _archive_file_path()
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(line)
    return file_path