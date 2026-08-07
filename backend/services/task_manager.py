"""任務管理器：標準模式與公司模式統一的後台任務執行。

所有對話任務改為後台非同步執行，透過 API 暴露即時進度
（階段、事件流；公司模式另有看板與預算），供前端任務
介面輪詢：

    POST /tasks          建立任務（回傳 task_id）
    GET  /tasks/{id}     查詢任務進度與結果

持久化（容器重啟不丟失）：
- 任務記錄即時寫入 Redis（`evoloop:task:{task_id}`，TTL 7 天），
  Redis 不可用時降級為純記憶體；重啟後仍在 running 的任務
  會被標記為失敗（服務中斷）
- 任務完成後寫入 JSONL 對話存檔（與 /chat 同一存檔管線）

標準模式流程（即時回報每個階段）：
  記憶檢索 → 生成 → 評估 →（反思 → 改進 → 再評估）* → 完成

公司模式流程：
  CompanyOrchestrator 完整公司流程（分解→執行→審查→整合→最終審查），
  事件匯流排掛載監聽器收集生命週期事件；產出成功後同樣
  進入評估/反思/改進迭代迴圈。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import redis

from backend.company.events import CompanyEvent
from backend.company.orchestrator import CompanyOrchestrator
from backend.company.roles import BUILTIN_TEMPLATES
from backend.core import nodes
from backend.core.graph import MAX_ITERATIONS, PASS_THRESHOLD
from backend.services.archiver import save_session_archive_sync
from opc_service.act import act_opc
from opc_service.analyze import analyze_opc
from opc_service.decide import decide_opc
from opc_service.diagnose import diagnose_opc
from opc_service.preprocess import preprocess_opc
from opc_service.sense import sense_opc

logger = logging.getLogger(__name__)

# 任務記憶體上限（避免無限增長）
MAX_TASKS = 100
MAX_EVENTS_PER_TASK = 200

# Redis 持久化參數
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
TASK_KEY_PREFIX = "evoloop:task:"
TASK_TTL_SECONDS = 7 * 86400


class TaskRecord:
    """單一任務的運行狀態記錄。"""

    def __init__(self, task_id: str, query: str, mode: str, template: str):
        self.task_id = task_id
        self.query = query
        self.mode = mode  # standard / company
        self.template = template
        self.status = "pending"  # pending / running / completed / failed
        self.phase = ""
        self.events: list[dict[str, Any]] = []
        self.kanban: dict[str, list[dict]] = {}
        self.budget: dict[str, Any] = {}
        self.answer = ""
        self.score: float | None = None
        self.iteration = 0
        self.error = ""
        # 公司模式細節：分解計劃、最終審查結果、工作項統計
        self.plan: dict[str, Any] | None = None
        self.review: dict[str, Any] | None = None
        self.stats: dict[str, Any] | None = None
        # OPC 模式：6 级闭环状态数据
        self.opc_state: dict[str, Any] = {}
        self.created_at = time.time()

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "status": self.status,
            "mode": self.mode,
            "query": self.query,
            "template": self.template,
            "phase": self.phase,
            "events": self.events[-50:],  # API 回傳最近 50 條
            "kanban": self.kanban,
            "budget": self.budget,
            "answer": self.answer,
            "score": self.score,
            "iteration": self.iteration,
            "error": self.error,
            "plan": self.plan,
            "review": self.review,
            "stats": self.stats,
            "opc_state": self.opc_state,
            "created_at": self.created_at,
        }

    def to_snapshot(self) -> dict[str, Any]:
        """完整快照（供持久化，含全部事件）。"""
        data = self.to_dict()
        data["events"] = self.events
        data["created_at"] = self.created_at
        return data

    @classmethod
    def from_snapshot(cls, data: dict[str, Any]) -> "TaskRecord":
        record = cls(
            data["task_id"], data.get("query", ""),
            data.get("mode", "standard"), data.get("template", "quick_task"),
        )
        record.status = data.get("status", "failed")
        record.phase = data.get("phase", "")
        record.events = data.get("events", [])
        record.kanban = data.get("kanban", {})
        record.budget = data.get("budget", {})
        record.answer = data.get("answer", "")
        record.score = data.get("score")
        record.iteration = data.get("iteration", 0)
        record.error = data.get("error", "")
        record.plan = data.get("plan")
        record.review = data.get("review")
        record.stats = data.get("stats")
        record.opc_state = data.get("opc_state", {})
        record.created_at = data.get("created_at", time.time())
        return record


class TaskManager:
    """任務管理器（進程內單例，任務記錄持久化到 Redis）。"""

    def __init__(self) -> None:
        self.tasks: dict[str, TaskRecord] = {}
        self._redis: redis.Redis | None = None
        self._redis_failed = False

    # ── Redis 持久化 ──

    def _get_redis(self) -> "redis.Redis | None":
        """惰性取得 Redis 連線；失敗後不再重試（降級為記憶體）。"""
        if self._redis is not None:
            return self._redis
        if self._redis_failed:
            return None
        try:
            import redis
            client = redis.Redis.from_url(
                REDIS_URL, decode_responses=True, socket_connect_timeout=2
            )
            client.ping()
            self._redis = client
            logger.info("任務持久化：Redis 連線成功")
            return client
        except Exception as exc:  # noqa: BLE001
            logger.warning("任務持久化：Redis 不可用，降級為記憶體：%s", exc)
            self._redis_failed = True
            return None

    def _persist(self, record: TaskRecord) -> None:
        """將任務快照寫入 Redis（盡力而為）。"""
        client = self._get_redis()
        if client is None:
            return
        try:
            client.set(
                TASK_KEY_PREFIX + record.task_id,
                json.dumps(record.to_snapshot(), ensure_ascii=False),
                ex=TASK_TTL_SECONDS,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("任務持久化寫入失敗：%s", exc)

    def _load_from_redis(self, task_id: str) -> TaskRecord | None:
        client = self._get_redis()
        if client is None:
            return None
        try:
            raw = client.get(TASK_KEY_PREFIX + task_id)
            if not raw:
                return None
            record = TaskRecord.from_snapshot(json.loads(raw))
            # 服務重啟後仍在運行的任務不可能繼續，標記為失敗
            if record.status in ("pending", "running"):
                record.status = "failed"
                record.error = record.error or "後端服務重啟，任務中斷"
                self._persist(record)
            return record
        except Exception as exc:  # noqa: BLE001
            logger.warning("任務記錄讀取失敗：%s", exc)
            return None

    # ── 公開 API ──

    def create_task(self, query: str, mode: str, template: str) -> TaskRecord:
        task_id = uuid.uuid4().hex[:12]
        record = TaskRecord(task_id, query, mode, template)
        self.tasks[task_id] = record
        self._persist(record)
        # 簡單淘汰：超出上限時刪除最舊的已完成任務
        if len(self.tasks) > MAX_TASKS:
            finished = [
                t for t in self.tasks.values()
                if t.status in ("completed", "failed")
            ]
            for t in sorted(finished, key=lambda x: x.created_at)[:10]:
                self.tasks.pop(t.task_id, None)
        return record

    def get_task(self, task_id: str) -> TaskRecord | None:
        record = self.tasks.get(task_id)
        if record is not None:
            return record
        # 記憶體沒有（可能是重啟後）→ 從 Redis 恢復
        record = self._load_from_redis(task_id)
        if record is not None:
            self.tasks[task_id] = record
        return record

    def start_task(self, record: TaskRecord) -> None:
        """以背景任務方式啟動（依模式分派）。"""
        if record.mode == "company":
            asyncio.create_task(self._run_company_task(record))
        elif record.mode == "opc":
            asyncio.create_task(self._run_opc_task(record))
        else:
            asyncio.create_task(self._run_standard_task(record))

    # ── 事件記錄輔助（每次變更都持久化） ──

    def _set_phase(self, record: TaskRecord, phase: str, **data: Any) -> None:
        record.phase = phase
        record.events.append({
            "ts": time.time(),
            "event": "phase_change",
            "data": {"phase": phase, **data},
        })
        self._persist(record)

    def _add_event(self, record: TaskRecord, event: str, data: dict[str, Any]) -> None:
        record.events.append({"ts": time.time(), "event": event, "data": data})
        if len(record.events) > MAX_EVENTS_PER_TASK:
            record.events = record.events[-MAX_EVENTS_PER_TASK:]
        self._persist(record)

    def _finish(self, record: TaskRecord) -> None:
        """任務結束（完成/失敗）：持久化並寫入 JSONL 存檔。"""
        self._persist(record)
        if record.status == "completed":
            self._archive_task(record)

    def _archive_task(self, record: TaskRecord) -> None:
        """將任務結果寫入 JSONL 對話存檔（與 /chat 同一管線）。"""
        state: dict[str, Any] = {
            "query": record.query,
            "session_id": record.task_id,
            "current_answer": record.answer,
            "final_answer": record.answer,
            "score": record.score,
            "iteration": record.iteration,
            "reflections": [],
            "retrieved_memories": [],
            "archive_metadata": {
                "source": "task_api",
                "mode": record.mode,
                "template": record.template,
            },
        }
        try:
            save_session_archive_sync(state, record.task_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("任務存檔失敗（不影響結果）：%s", exc)

    # ── 標準模式執行 ──

    async def _run_standard_task(self, record: TaskRecord) -> None:
        """標準反思迴圈：逐步回報階段與評分。"""
        record.status = "running"
        self._persist(record)
        state: dict[str, Any] = {
            "query": record.query,
            "session_id": record.task_id,
            "history": [],
        }
        try:
            self._set_phase(record, "retrieve_memories")
            state.update(await asyncio.to_thread(nodes.retrieve_memories, state))

            self._set_phase(record, "generate")
            state.update(await asyncio.to_thread(nodes.generate_initial_answer, state))

            self._set_phase(record, "evaluate")
            state.update(await asyncio.to_thread(nodes.evaluate_answer, state))
            self._add_event(record, "evaluation", {
                "score": state.get("score"),
                "iteration": 0,
            })

            while (
                state.get("score", 0.0) < PASS_THRESHOLD
                and state.get("iteration", 0) < MAX_ITERATIONS
            ):
                self._set_phase(record, "reflect", iteration=state.get("iteration", 0))
                state.update(await asyncio.to_thread(nodes.reflect, state))

                self._set_phase(record, "improve", iteration=state.get("iteration", 0))
                state.update(await asyncio.to_thread(nodes.improve_answer, state))

                self._set_phase(record, "evaluate")
                state.update(await asyncio.to_thread(nodes.evaluate_answer, state))
                self._add_event(record, "evaluation", {
                    "score": state.get("score"),
                    "iteration": state.get("iteration", 0),
                })

            record.answer = state.get("current_answer", "")
            record.score = state.get("score")
            record.iteration = state.get("iteration", 0)
            record.status = "completed"
            self._set_phase(record, "done")
        except Exception as exc:  # noqa: BLE001
            logger.error("標準任務 %s 執行失敗：%s", record.task_id, exc)
            record.status = "failed"
            record.error = str(exc)
        self._finish(record)

    # ── 公司模式執行 ──

    def _attach_company_listener(
        self, record: TaskRecord, orchestrator: CompanyOrchestrator
    ) -> None:
        """掛載事件監聽器：收集事件並更新看板快照。"""

        def listener(event: CompanyEvent, data: dict[str, Any]) -> None:
            event_data = {k: v for k, v in data.items() if k != "config"}
            # execution_plan 較大且已存於 record.plan，不重複放入事件流
            if event == CompanyEvent.DECOMPOSE_DONE:
                event_data.pop("execution_plan", None)
            self._add_event(record, event.value, event_data)
            if event == CompanyEvent.PHASE_CHANGE:
                record.phase = str(data.get("phase", ""))
            # 分解完成：即時記錄規劃（供任務頁執行中展示）
            if event == CompanyEvent.DECOMPOSE_DONE:
                record.plan = {
                    "subtask_count": data.get("subtask_count"),
                    "strategy": data.get("strategy"),
                    "execution_plan": data.get("execution_plan"),
                }
            # 每次事件都刷新看板與預算快照
            try:
                record.kanban = {
                    status.value: items
                    for status, items in orchestrator.get_kanban().items()
                }
                record.budget = orchestrator.get_budget_status()
            except Exception:  # noqa: BLE001
                pass

        orchestrator.events.on(listener)

    async def _run_company_task(self, record: TaskRecord) -> None:
        record.status = "running"
        record.phase = "starting"
        self._persist(record)

        config = BUILTIN_TEMPLATES.get(record.template)
        if config is None:
            config = BUILTIN_TEMPLATES["quick_task"]

        orchestrator = CompanyOrchestrator(config)
        self._attach_company_listener(record, orchestrator)

        try:
            result = await orchestrator.execute(record.query)
        except Exception as exc:  # noqa: BLE001
            logger.error("公司任務 %s 執行失敗：%s", record.task_id, exc)
            record.status = "failed"
            record.error = str(exc)
            self._finish(record)
            return

        if not result.get("success"):
            record.status = "failed"
            record.error = result.get("final_output", "公司流程執行失敗")
            self._finish(record)
            return

        # ── 提取公司運行細節（供任務頁展示） ──
        record.review = result.get("review")
        record.stats = result.get("stats")
        for entry in result.get("run_log", []):
            if entry.get("event") == "decompose_done":
                record.plan = {
                    "subtask_count": entry.get("subtask_count"),
                    "strategy": entry.get("strategy"),
                    "execution_plan": entry.get("execution_plan"),
                }
                break
        self._persist(record)

        # ── 公司產出進入評估/反思/改進迭代迴圈 ──
        self._set_phase(record, "evaluate")
        state: dict[str, Any] = {
            "query": record.query,
            "session_id": record.task_id,
            "current_answer": result.get("final_output", ""),
            "iteration": 0,
            "score": 0.0,
        }
        try:
            state.update(await asyncio.to_thread(nodes.evaluate_answer, state))
            self._add_event(record, "evaluation", {"score": state.get("score"), "iteration": 0})
            while (
                state.get("score", 0.0) < PASS_THRESHOLD
                and state.get("iteration", 0) < MAX_ITERATIONS
            ):
                state.update(await asyncio.to_thread(nodes.reflect, state))
                state.update(await asyncio.to_thread(nodes.improve_answer, state))
                state.update(await asyncio.to_thread(nodes.evaluate_answer, state))
                self._add_event(record, "evaluation", {
                    "score": state.get("score"),
                    "iteration": state.get("iteration", 0),
                })
        except Exception as exc:  # noqa: BLE001
            logger.warning("任務 %s 評估迴圈失敗（保留公司產出）：%s", record.task_id, exc)

        record.answer = state.get("current_answer", "")
        record.score = state.get("score")
        record.iteration = state.get("iteration", 0)
        record.status = "completed"
        self._set_phase(record, "done")
        self._finish(record)

    # ── OPC 6 級閉環執行 ──

    async def _run_opc_task(self, record: TaskRecord) -> None:
        """OPC 6 級思考閉環：感知→預處理→分析→診斷→決策→執行。

        逐級執行 OPC 節點，每級回報階段與數據，
        最終彙整 6 級結果供前端展示。
        """
        record.status = "running"
        self._persist(record)

        state: dict[str, Any] = {
            "query": record.query,
            "session_id": record.task_id,
        }

        try:
            # ── 第 1 級：感知 (Sense) ──
            self._set_phase(record, "sense_opc")
            state.update(await sense_opc(state))
            record.opc_state["sense"] = {
                "readings": state.get("opc_readings", {}),
                "tag_count": len(state.get("opc_readings", {})),
            }
            self._persist(record)

            # ── 第 2 級：預處理 (Preprocess) ──
            self._set_phase(record, "preprocess_opc")
            state.update(await preprocess_opc(state))
            record.opc_state["preprocess"] = {
                "quality_report": state.get("opc_quality_report", {}),
                "clean_count": len(state.get("opc_readings_clean", {})),
            }
            self._persist(record)

            # ── 第 3 級：分析 (Analyze) ──
            self._set_phase(record, "analyze_opc")
            state.update(await analyze_opc(state))
            record.opc_state["analyze"] = state.get("opc_analysis", {})
            self._persist(record)

            # ── 第 4 級：診斷 (Diagnose) ──
            self._set_phase(record, "diagnose_opc")
            state.update(await asyncio.to_thread(diagnose_opc, state))
            record.opc_state["diagnose"] = state.get("opc_diagnosis", {})
            self._persist(record)

            # ── 第 5 級：決策 (Decide) ──
            self._set_phase(record, "decide_opc")
            state.update(await asyncio.to_thread(decide_opc, state))
            record.opc_state["decide"] = {
                "decisions": state.get("opc_decisions", []),
                "summary": state.get("opc_decision_summary", ""),
            }
            self._persist(record)

            # ── 第 6 級：執行 (Act) ──
            self._set_phase(record, "act_opc")
            state.update(await act_opc(state))
            record.opc_state["act"] = {
                "actions": state.get("opc_actions", []),
                "action_count": len(state.get("opc_actions", [])),
                "success_count": sum(
                    1 for a in state.get("opc_actions", []) if a.get("success")
                ),
            }

            # ── 彙整 6 級診斷結果為回答 ──
            diagnosis = state.get("opc_diagnosis", {})
            analysis = state.get("opc_analysis", {})
            quality = state.get("opc_quality_report", {})
            decisions = state.get("opc_decisions", [])
            actions = state.get("opc_actions", [])

            answer_parts = ["## OPC 6 級思考閉環診斷報告\n"]

            # 數據品質
            answer_parts.append(
                f"**數據品質**：總標籤 {quality.get('total', 0)}，"
                f"良好 {quality.get('good', 0)}，不良 {quality.get('bad', 0)}"
            )

            # 分析摘要
            answer_parts.append(f"**統計分析**：{analysis.get('summary', '無')}")

            # 診斷結果
            answer_parts.append(
                f"**診斷結果**：{'⚠️ 檢測到異常' if diagnosis.get('anomaly_detected') else '✅ 無異常'}\n"
                f"- 嚴重程度：{diagnosis.get('severity', 'normal')}\n"
                f"- 根因分析：{diagnosis.get('root_cause', '無')}\n"
                f"- 詳細分析：{diagnosis.get('analysis', '無')}"
            )

            # 決策摘要
            if decisions:
                answer_parts.append(
                    f"**控制決策**：{state.get('opc_decision_summary', '')}"
                )
                for i, d in enumerate(decisions):
                    answer_parts.append(
                        f"{i + 1}. {d.get('tag_name', '?')} → "
                        f"{d.get('value', '?')} "
                        f"（優先級：{d.get('priority', '?')}，"
                        f"風險：{d.get('risk', '?')}）"
                    )
            else:
                answer_parts.append("**控制決策**：無需執行控制動作")

            # 執行結果
            if actions:
                success = sum(1 for a in actions if a.get("success"))
                answer_parts.append(
                    f"**執行結果**：{success}/{len(actions)} 成功"
                )

            record.answer = "\n\n".join(answer_parts)
            record.status = "completed"

        except Exception as exc:  # noqa: BLE001
            logger.error("OPC 任務 %s 執行失敗：%s", record.task_id, exc)
            record.status = "failed"
            record.error = str(exc)

        self._set_phase(record, "done")
        self._finish(record)


# 進程內單例
task_manager = TaskManager()
