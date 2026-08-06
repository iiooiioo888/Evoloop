"""公司運行時執行軌跡持久 sink（JSONL）。

為每次公司 run 提供進程結束後仍可查閱的診斷軌跡：
trigger → decision → failure/recovery → result。

特性：
- 每次 run 一個 JSONL 檔案（run_<run_id>.jsonl），每行一個事件
- 每筆記錄帶 run_id 與 UTC 時間戳，降級事件帶 degraded=true 標記
- 目錄可透過環境變數 EVOL_COMPANY_RUN_LOG_DIR 覆蓋（測試隔離）
- 寫入失敗僅記錄警告，絕不中斷公司主流程
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# 預設軌跡目錄：backend/data/company_runs
DEFAULT_RUN_LOG_DIR = (
    Path(__file__).resolve().parent.parent / "data" / "company_runs"
)


def run_log_dir() -> Path:
    """解析軌跡目錄（每次呼叫時解析，方便測試以環境變數覆蓋）。"""
    return Path(os.getenv("EVOL_COMPANY_RUN_LOG_DIR", str(DEFAULT_RUN_LOG_DIR)))


def run_log_path(run_id: str) -> Path:
    """指定 run 的 JSONL 軌跡檔案路徑。"""
    return run_log_dir() / f"run_{run_id}.jsonl"


def utc_now_iso() -> str:
    """當前 UTC 時間的 ISO 字串。"""
    return datetime.now(timezone.utc).isoformat()


def append_run_record(record: dict[str, Any]) -> Path | None:
    """將一筆 run 事件記錄追加到對應的 JSONL 檔案。

    Args:
        record: 事件記錄，須含 run_id 與 event 欄位

    Returns:
        寫入的檔案路徑；寫入失敗時回傳 None（已記錄警告）
    """
    run_id = str(record.get("run_id") or "unknown")
    try:
        directory = run_log_dir()
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"run_{run_id}.jsonl"
        line = json.dumps(record, ensure_ascii=False, default=str) + "\n"
        with open(path, "a", encoding="utf-8") as f:
            f.write(line)
        return path
    except OSError:
        logger.warning("公司執行軌跡寫入失敗（已忽略）：run_id=%s", run_id, exc_info=True)
        return None
