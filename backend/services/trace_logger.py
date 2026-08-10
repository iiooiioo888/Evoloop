"""思考過程記錄器（Trace Logger）。

完整記錄任務執行過程中的所有記憶、上下文、思考過程：
- LLM 調用（prompt、response、model、cost、耗時）
- 上下文注入（記憶檢索結果、依賴產物、角色記憶）
- 評估/反思的完整內容
- 工具調用與結果
- 階段切換與狀態快照

寫入 backend/data/traces/<task_id>.jsonl，每行一個事件。
支持斷點續跑：任務恢復時可讀取已有軌跡。
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# 預設軌跡目錄：backend/data/traces
DEFAULT_TRACE_DIR = Path(__file__).resolve().parent.parent / "data" / "traces"

# 檢查點目錄：backend/data/checkpoints
DEFAULT_CHECKPOINT_DIR = Path(__file__).resolve().parent.parent / "data" / "checkpoints"


def trace_dir() -> Path:
    """解析軌跡目錄（每次呼叫時解析，方便測試以環境變數覆蓋）。"""
    return Path(os.getenv("EVOL_TRACE_DIR", str(DEFAULT_TRACE_DIR)))


def checkpoint_dir() -> Path:
    """解析檢查點目錄。"""
    return Path(os.getenv("EVOL_CHECKPOINT_DIR", str(DEFAULT_CHECKPOINT_DIR)))


def trace_path(task_id: str) -> Path:
    """指定任務的 JSONL 軌跡檔案路徑。"""
    return trace_dir() / f"trace_{task_id}.jsonl"


def checkpoint_path(task_id: str) -> Path:
    """指定任務的檢查點檔案路徑。"""
    return checkpoint_dir() / f"checkpoint_{task_id}.json"


def utc_now_iso() -> str:
    """當前 UTC 時間的 ISO 字串。"""
    return datetime.now(timezone.utc).isoformat()


class TraceLogger:
    """任務思考過程記錄器。

    每個任務一個實例，所有事件寫入對應的 JSONL 檔案。
    寫入失敗僅記錄警告，絕不中斷主流程。

    使用範例：
        >>> tracer = TraceLogger("task_abc123")
        >>> tracer.log_llm_call(prompt="...", response="...", model="gpt-4o")
        >>> tracer.log_context_injection(source="memory", items=[...])
        >>> tracer.log_evaluation(score=8.5, feedback="...")
    """

    def __init__(self, task_id: str):
        self.task_id = task_id
        self._seq = 0  # 事件序號

    def _write(self, event_type: str, data: dict[str, Any]) -> None:
        """寫入一筆事件到 JSONL 檔案。"""
        self._seq += 1
        record = {
            "seq": self._seq,
            "ts": utc_now_iso(),
            "task_id": self.task_id,
            "event": event_type,
            **data,
        }
        try:
            directory = trace_dir()
            directory.mkdir(parents=True, exist_ok=True)
            path = trace_path(self.task_id)
            line = json.dumps(record, ensure_ascii=False, default=str) + "\n"
            with open(path, "a", encoding="utf-8") as f:
                f.write(line)
        except OSError as exc:
            logger.warning("軌跡寫入失敗（已忽略）：task_id=%s, %s", self.task_id, exc)

    # ── LLM 調用記錄 ──

    def log_llm_call(
        self,
        prompt: str,
        response: str,
        *,
        model: str | None = None,
        system: str | None = None,
        cost: float | None = None,
        duration_ms: float | None = None,
        phase: str = "",
        role: str = "",
        item_id: str = "",
        iteration: int = 0,
        truncated: bool = False,
    ) -> None:
        """記錄一次完整的 LLM 調用（prompt + response）。"""
        self._write("llm_call", {
            "phase": phase,
            "role": role,
            "item_id": item_id,
            "iteration": iteration,
            "model": model,
            "system": system[:2000] if system else None,
            "prompt": prompt[:8000] if not truncated else prompt[:8000] + "...[truncated]",
            "response": response[:8000] if not truncated else response[:8000] + "...[truncated]",
            "prompt_length": len(prompt),
            "response_length": len(response),
            "cost": cost,
            "duration_ms": duration_ms,
        })

    # ── 上下文注入記錄 ──

    def log_context_injection(
        self,
        source: str,
        items: list[dict[str, Any]] | list[str],
        *,
        phase: str = "",
        query: str = "",
        count: int | None = None,
    ) -> None:
        """記錄上下文注入（記憶檢索、依賴產物、角色記憶等）。

        Args:
            source: 來源類型（memory / dependency / role_memory / history）
            items: 注入的內容列表
            phase: 當前階段
            query: 檢索查詢
            count: 項目數量
        """
        self._write("context_injection", {
            "source": source,
            "phase": phase,
            "query": query[:500] if query else "",
            "count": count if count is not None else len(items),
            "items": [
                (item if isinstance(item, str) else json.dumps(item, ensure_ascii=False, default=str))[:1000]
                for item in items[:20]  # 最多記錄 20 條
            ],
        })

    # ── 評估記錄 ──

    def log_evaluation(
        self,
        score: float | None,
        feedback: str = "",
        *,
        iteration: int = 0,
        phase: str = "evaluate",
        raw_response: str = "",
        strengths: str = "",
        weaknesses: str = "",
    ) -> None:
        """記錄評估結果（分數、回饋、優缺點）。"""
        self._write("evaluation", {
            "phase": phase,
            "iteration": iteration,
            "score": score,
            "feedback": feedback[:2000],
            "strengths": strengths[:1000],
            "weaknesses": weaknesses[:1000],
            "raw_response": raw_response[:3000],
        })

    # ── 反思記錄 ──

    def log_reflection(
        self,
        reflection: str,
        *,
        iteration: int = 0,
        phase: str = "reflect",
        current_answer_preview: str = "",
    ) -> None:
        """記錄反思內容。"""
        self._write("reflection", {
            "phase": phase,
            "iteration": iteration,
            "reflection": reflection[:3000],
            "current_answer_preview": current_answer_preview[:500],
        })

    # ── 改進記錄 ──

    def log_improvement(
        self,
        improved_answer: str,
        *,
        iteration: int = 0,
        phase: str = "improve",
        based_on_reflection: str = "",
    ) -> None:
        """記錄改進後的回答。"""
        self._write("improvement", {
            "phase": phase,
            "iteration": iteration,
            "improved_answer": improved_answer[:5000],
            "based_on_reflection": based_on_reflection[:1000],
        })

    # ── 階段切換記錄 ──

    def log_phase_change(
        self,
        phase: str,
        *,
        data: dict[str, Any] | None = None,
    ) -> None:
        """記錄階段切換。"""
        self._write("phase_change", {
            "phase": phase,
            **(data or {}),
        })

    # ── 工具調用記錄 ──

    def log_tool_call(
        self,
        tool: str,
        args: dict[str, Any],
        result: str,
        *,
        success: bool = True,
        phase: str = "",
        item_id: str = "",
        duration_ms: float | None = None,
    ) -> None:
        """記錄工具調用與結果。"""
        self._write("tool_call", {
            "phase": phase,
            "item_id": item_id,
            "tool": tool,
            "args": args,
            "result": result[:3000],
            "success": success,
            "duration_ms": duration_ms,
        })

    # ── 狀態快照記錄 ──

    def log_state_snapshot(
        self,
        state: dict[str, Any],
        *,
        phase: str = "",
        label: str = "",
    ) -> None:
        """記錄完整狀態快照（供斷點續跑參考）。"""
        # 過濾不可序列化的內容
        safe_state = {}
        for k, v in state.items():
            try:
                json.dumps(v, ensure_ascii=False, default=str)
                safe_state[k] = v
            except (TypeError, ValueError):
                safe_state[k] = str(v)[:500]
        self._write("state_snapshot", {
            "phase": phase,
            "label": label,
            "state": safe_state,
        })

    # ── 記憶操作記錄 ──

    def log_memory_operation(
        self,
        operation: str,
        *,
        memory_id: str = "",
        text: str = "",
        metadata: dict[str, Any] | None = None,
        phase: str = "",
    ) -> None:
        """記錄記憶庫操作（保存/檢索/刪除）。"""
        self._write("memory_operation", {
            "phase": phase,
            "operation": operation,
            "memory_id": memory_id,
            "text": text[:2000],
            "metadata": metadata or {},
        })

    # ── 錯誤記錄 ──

    def log_error(
        self,
        error: str,
        *,
        phase: str = "",
        recoverable: bool = True,
        context: str = "",
    ) -> None:
        """記錄錯誤事件。"""
        self._write("error", {
            "phase": phase,
            "error": error[:2000],
            "recoverable": recoverable,
            "context": context[:1000],
        })

    # ── 自定義事件 ──

    def log_custom(self, event_type: str, data: dict[str, Any]) -> None:
        """記錄自定義事件。"""
        self._write(event_type, data)


# ═══════════════════════════════════════════════════════════
# 檢查點管理
# ═══════════════════════════════════════════════════════════


def save_checkpoint(task_id: str, checkpoint_data: dict[str, Any]) -> Path | None:
    """保存任務檢查點到本地 JSON 檔案。

    Args:
        task_id: 任務 ID
        checkpoint_data: 檢查點數據（orchestrator.to_checkpoint() 的結果）

    Returns:
        寫入的檔案路徑；失敗時回傳 None
    """
    try:
        directory = checkpoint_dir()
        directory.mkdir(parents=True, exist_ok=True)
        path = checkpoint_path(task_id)
        data = {
            "task_id": task_id,
            "saved_at": utc_now_iso(),
            "version": 1,
            **checkpoint_data,
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
        logger.info("檢查點已保存：task_id=%s", task_id)
        return path
    except OSError as exc:
        logger.warning("檢查點保存失敗：task_id=%s, %s", task_id, exc)
        return None


def load_checkpoint(task_id: str) -> dict[str, Any] | None:
    """載入任務檢查點。

    Args:
        task_id: 任務 ID

    Returns:
        檢查點數據；不存在或讀取失敗時回傳 None
    """
    path = checkpoint_path(task_id)
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("檢查點載入失敗：task_id=%s, %s", task_id, exc)
        return None


def delete_checkpoint(task_id: str) -> bool:
    """刪除任務檢查點（任務完成後清理）。"""
    path = checkpoint_path(task_id)
    if path.exists():
        try:
            path.unlink()
            return True
        except OSError:
            return False
    return False


def list_checkpoints() -> list[dict[str, Any]]:
    """列出所有可恢復的檢查點。

    Returns:
        檢查點摘要列表（task_id, saved_at, goal, phase）
    """
    directory = checkpoint_dir()
    if not directory.exists():
        return []
    results = []
    for path in directory.glob("checkpoint_*.json"):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            results.append({
                "task_id": data.get("task_id", ""),
                "saved_at": data.get("saved_at", ""),
                "goal": data.get("goal", ""),
                "phase": data.get("phase", ""),
                "config_name": data.get("config_name", ""),
                "work_item_count": len(data.get("work_items", [])),
            })
        except (OSError, json.JSONDecodeError):
            continue
    results.sort(key=lambda x: x.get("saved_at", ""), reverse=True)
    return results


def read_trace(task_id: str, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    """讀取任務軌跡記錄。

    Args:
        task_id: 任務 ID
        limit: 返回條數上限
        offset: 跳過前 N 條

    Returns:
        事件記錄列表（按時間順序）
    """
    path = trace_path(task_id)
    if not path.exists():
        return []
    events = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    except OSError:
        return []
    return events[offset:offset + limit]


def list_traces(limit: int = 50) -> list[dict[str, Any]]:
    """列出所有軌跡檔案摘要。

    Returns:
        軌跡摘要列表（task_id, event_count, first_ts, last_ts, file_size）
    """
    directory = trace_dir()
    if not directory.exists():
        return []
    results = []
    for path in directory.glob("trace_*.jsonl"):
        try:
            task_id = path.stem.replace("trace_", "")
            stat = path.stat()
            # 讀取首行和末行獲取時間範圍
            first_ts = ""
            last_ts = ""
            event_count = 0
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        event_count += 1
                        try:
                            data = json.loads(line)
                            if not first_ts:
                                first_ts = data.get("ts", "")
                            last_ts = data.get("ts", "")
                        except json.JSONDecodeError:
                            continue
            results.append({
                "task_id": task_id,
                "event_count": event_count,
                "first_ts": first_ts,
                "last_ts": last_ts,
                "file_size_kb": round(stat.st_size / 1024, 1),
            })
        except OSError:
            continue
    results.sort(key=lambda x: x.get("last_ts", ""), reverse=True)
    return results[:limit]