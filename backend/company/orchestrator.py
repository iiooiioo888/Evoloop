"""多代理人公司協調器。

將 EvoLoop 反思迴圈擴展為完整的公司運行時，協調多個 AI 角色
分工合作完成複雜目標。核心流程：

  1. TaskDecomposer 接收目標 → 分解為工作項（主功能模組）
  2. 工作項依賴解析 → 平行執行（Developer 角色）
  3. 每個工作項執行完 → Reviewer 審查
  4. 審查不通過 → 退回修改（最多 N 輪）
  5. 所有工作項完成 → Synthesizer 整合
  6. Manager 最終審查 → 產出最終交付物

全程內建預算追蹤與模型層級路由。

任務拆分（TaskDecomposer）已提升為獨立的一級模組，
可脫離 CompanyOrchestrator 單獨使用與測試。
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any

from backend.company.budget import BudgetManager, CostTracker
from backend.company.decomposer import (
    TaskDecomposer,
)
from backend.company.events import CompanyEvent, EventBus
from backend.company.prompts import PromptConfig
from backend.company.roles import STANDARD_ROLES, RoleType
from backend.company.run_log import append_run_record, utc_now_iso
from backend.company.state import (
    BudgetTier,
    CompanyConfig,
    CompanyRunState,
    WorkItemStatus,
)
from backend.company.work_item import WorkItemManager
from backend.core.llm import call_llm, parse_json_response

logger = logging.getLogger(__name__)


class CompanyOrchestrator:
    """公司協調器：管理多角色分工執行流程。

    任務拆分委派給 TaskDecomposer（獨立主功能模組）。
    """

    def __init__(
        self,
        config: CompanyConfig | None = None,
        decomposer: TaskDecomposer | None = None,
        prompt_config: PromptConfig | None = None,
    ):
        self.config = config or CompanyConfig(roles=STANDARD_ROLES)
        self.budget = BudgetManager(self.config.budget)
        self.work_items = WorkItemManager()
        self._run_state: CompanyRunState | None = None
        self._run_log: list[dict[str, Any]] = []
        self._run_id: str | None = None
        self.prompt_config = prompt_config or self.config.prompt_config
        self.events = EventBus()
        # EventBus 事件同步寫入持久軌跡 sink（JSONL）
        self.events.on(self._persist_bus_event)
        # 任務拆分器（可注入，方便測試）
        self.decomposer = decomposer or TaskDecomposer(
            self.config, self.budget, self.work_items
        )
        # 並行工作池信號量
        self._worker_semaphore = asyncio.Semaphore(
            self.config.max_parallel_workers
        )

    # ═══════════════════════════════════════════════════════════
    # 公開 API
    # ═══════════════════════════════════════════════════════════

    async def execute(self, goal: str) -> dict[str, Any]:
        """執行公司目標，回傳最終結果。

        這是主要的進入點，執行完整的公司運行流程。
        """
        self._run_log = []
        # 每次 run 生成穩定的 run_id，作為持久軌跡的關聯鍵
        self._run_id = uuid.uuid4().hex
        self.budget.reset_task()
        self.work_items = WorkItemManager()
        self.decomposer.work_items = self.work_items  # 同步引用

        self._log(
            "company_start",
            {"goal": goal, "config": self.config.name},
            level=logging.INFO,
        )
        self.events.emit(CompanyEvent.COMPANY_START, {"goal": goal, "config": self.config.name})

        # ── 階段 1：TaskDecomposer 分解目標（主功能模組）──
        self._log("phase", {"phase": "decompose", "module": "TaskDecomposer"})
        self.events.emit(CompanyEvent.PHASE_CHANGE, {"phase": "decompose"})
        decompose_result = await self.decomposer.decompose(goal)
        if not decompose_result.subtasks:
            return self._error_result("任務分解失敗，無法產生工作項")

        # 建立工作項（含依賴解析）
        work_items = self.decomposer.build_work_items(
            decompose_result,
            created_by=RoleType.MANAGER,
        )
        self._log("decompose_done", {
            "subtask_count": len(work_items),
            "strategy": decompose_result.strategy.value,
            "execution_plan": decompose_result.execution_plan,
        })
        self.events.emit(CompanyEvent.DECOMPOSE_DONE, {
            "subtask_count": len(work_items),
            "strategy": decompose_result.strategy.value,
            "execution_plan": decompose_result.execution_plan,
        })

        # ── 階段 2：執行-審查迴圈 ──
        self._log("phase", {"phase": "execute_review", "work_items": len(work_items)})
        self.events.emit(CompanyEvent.PHASE_CHANGE, {"phase": "execute_review", "work_items": len(work_items)})
        await self._execute_review_loop(goal)

        # ── 階段 3：Synthesizer 整合 ──
        self._log("phase", {"phase": "synthesize"})
        self.events.emit(CompanyEvent.PHASE_CHANGE, {"phase": "synthesize"})
        final_output = await self._synthesize(goal)

        # ── 階段 4：Manager 最終審查 ──
        self._log("phase", {"phase": "final_review"})
        self.events.emit(CompanyEvent.PHASE_CHANGE, {"phase": "final_review"})
        review_result = await self._manager_final_review(goal, final_output)

        self._log(
            "company_done",
            {
                "total_items": len(work_items),
                "completed_items": self.work_items.get_stats()["done"],
                "review_rounds": self._count_review_rounds(),
                "total_cost": round(self.budget.task_spent, 4),
            },
            level=logging.INFO,
        )
        self.events.emit(CompanyEvent.COMPANY_DONE, {
            "total_items": len(work_items),
            "completed_items": self.work_items.get_stats()["done"],
            "total_cost": round(self.budget.task_spent, 4),
        })

        return {
            "success": True,
            "run_id": self._run_id,
            "goal": goal,
            "final_output": final_output,
            "review": review_result,
            "kanban": self.work_items.get_kanban(),
            "stats": self.work_items.get_stats(),
            "budget": self.budget.to_dict(),
            "run_log": self._run_log,
        }

    def get_kanban(self) -> dict:
        """取得當前看板狀態。"""
        return self.work_items.get_kanban()

    def get_budget_status(self) -> dict:
        """取得預算狀態。"""
        return self.budget.to_dict()

    # ═══════════════════════════════════════════════════════════
    # 檢查點（Save / Resume）
    # ═══════════════════════════════════════════════════════════

    def to_checkpoint(self, goal: str = "") -> dict[str, Any]:
        """將當前運行狀態序列化為檢查點。

        包含所有工作項、預算、日誌，可用於中斷後恢復。

        Args:
            goal: 目標描述（可選）

        Returns:
            可序列化的檢查點字典
        """
        return {
            "goal": goal,
            "run_id": self._run_id,
            "config_name": self.config.name,
            "timestamp": datetime.now().isoformat(),
            "work_items": [
                {
                    "id": item.id,
                    "title": item.title,
                    "description": item.description,
                    "assignee": item.assignee.value if item.assignee else None,
                    "status": item.status.value,
                    "tier": item.tier,
                    "priority": getattr(item, "priority", 0),
                    "dependencies": item.depends_on,
                    "artifacts": item.artifacts,
                    "actual_cost": item.actual_cost,
                    "review_count": getattr(item, "review_count", 0),
                    "created_by": item.created_by.value if item.created_by else None,
                }
                for item in self.work_items._items.values()
            ],
            "budget": self.budget.to_dict(),
            "run_log": self._run_log,
        }

    def _restore_from_checkpoint(self, data: dict[str, Any]) -> None:
        """從檢查點恢復工作項與預算狀態（內部方法）。"""
        from backend.company.work_item import WorkItem, WorkItemStatus

        restored_items: list[WorkItem] = []
        by_id: dict[str, WorkItem] = {}

        for item_data in data.get("work_items", []):
            item = WorkItem(
                title=item_data["title"],
                description=item_data.get("description", ""),
                assignee=RoleType(item_data["assignee"]) if item_data.get("assignee") else None,
                tier=item_data.get("tier", "routine"),
                created_by=RoleType(item_data["created_by"]) if item_data.get("created_by") else None,
            )
            item.id = item_data["id"]
            item.status = WorkItemStatus(item_data["status"])
            item.artifacts = item_data.get("artifacts", {})
            item.actual_cost = item_data.get("actual_cost", 0.0)
            if hasattr(item, "review_count"):
                item.review_count = item_data.get("review_count", 0)
            if hasattr(item, "priority"):
                item.priority = item_data.get("priority", 0)
            restored_items.append(item)
            by_id[item.id] = item

        # 恢復依賴關係
        for item_data, item in zip(data.get("work_items", []), restored_items):
            for dep_id in item_data.get("dependencies", []):
                if dep_id in by_id:
                    item.depends_on.append(dep_id)

        self.work_items._items = {item.id: item for item in restored_items}

        # 恢復預算
        budget_data = data.get("budget", {})
        if budget_data:
            self.budget._task_spent = budget_data.get("task_spent", 0.0)

        # 恢復日誌與 run_id
        self._run_log = data.get("run_log", [])
        self._run_id = data.get("run_id") or self._run_id

    @staticmethod
    def from_checkpoint(
        data: dict[str, Any],
        config: CompanyConfig | None = None,
        prompt_config: PromptConfig | None = None,
    ) -> CompanyOrchestrator:
        """從檢查點建立可恢復的 Orchestrator。

        Args:
            data: to_checkpoint() 產生的檢查點字典
            config: 公司配置（若為 None 則使用預設）
            prompt_config: 提示詞配置

        Returns:
            已恢復狀態的 CompanyOrchestrator 實例
        """
        orchestrator = CompanyOrchestrator(
            config=config,
            prompt_config=prompt_config,
        )
        orchestrator._restore_from_checkpoint(data)
        return orchestrator

    # ═══════════════════════════════════════════════════════════
    # 階段 2：執行-審查迴圈
    # ═══════════════════════════════════════════════════════════

    async def _execute_review_loop(self, goal: str) -> None:
        """執行-審查主迴圈：平行執行就緒工作項（Semaphore 限制並行數），逐個審查。"""
        max_rounds = self.config.max_review_rounds

        while self.work_items.has_work_remaining():
            ready_items = self.work_items.get_ready_items()

            if not ready_items:
                # 檢查是否有阻塞的工作項
                blocked = self.work_items.get_blocked_by_deps()
                if blocked:
                    logger.warning(
                        "%d 個工作項因依賴未滿足而阻塞",
                        len(blocked),
                    )
                # 檢查是否全部完成
                if self.work_items.is_all_done():
                    break
                # 等待（實際場景中可能有非同步事件）
                await asyncio.sleep(0.1)
                continue

            # 平行執行就緒工作項（Semaphore 限制並行數）
            self._log("parallel_execute", {
                "count": len(ready_items),
                "max_parallel": self.config.max_parallel_workers,
            })
            tasks = [
                self._execute_with_semaphore(goal, item)
                for item in ready_items
            ]
            await asyncio.gather(*tasks)

            # 審查每個剛完成的工作項
            for item in ready_items:
                # 重新取得最新狀態
                current = self.work_items.get(item.id)
                if current and current.status == WorkItemStatus.IN_REVIEW:
                    await self._review_item(goal, current, max_rounds)

    async def _execute_with_semaphore(self, goal: str, item) -> None:
        """用 Semaphore 包裝 _execute_single_item，限制並行數。"""
        async with self._worker_semaphore:
            await self._execute_single_item(goal, item)

    async def _execute_single_item(self, goal: str, item) -> None:
        """根據指派角色執行單一工作項（含重試、超時、角色升級）。"""
        self.work_items.transition(item.id, WorkItemStatus.EXECUTING)
        self.events.emit(CompanyEvent.WORK_ITEM_START, {
            "item_id": item.id, "title": item.title, "assignee": item.assignee.value if item.assignee else None,
        })

        # 取得角色定義
        role_type = item.assignee or RoleType.DEVELOPER
        role_def = self.config.roles.get(role_type)
        if role_def is None:
            role_def = STANDARD_ROLES.get(role_type, STANDARD_ROLES[RoleType.DEVELOPER])

        model = self.budget.resolve_model_for_tier(item.tier)
        context = self._build_context(item)

        # 使用角色專用執行提示（若有）
        role_specific_prompt = self.prompt_config.role_execute_prompts.get(role_type.value, "")

        prompt = self.prompt_config.developer_execute.format(
            goal=goal,
            role_name=role_def.name,
            title=item.title,
            description=item.description,
            context=context,
        )
        if role_specific_prompt:
            prompt = prompt + "\n\n" + role_specific_prompt

        # ── 重試迴圈（含指數退避 + 超時 + 角色升級）──
        retry_cfg = self.config.retry_config
        last_error = None

        for attempt in range(retry_cfg.max_retries + 1):
            try:
                # 超時控制
                if retry_cfg.deadline_seconds > 0:
                    raw = await asyncio.wait_for(
                        asyncio.to_thread(
                            call_llm,
                            prompt,
                            system=role_def.system_prompt or self.prompt_config.developer_execute_system,
                            model=model,
                        ),
                        timeout=retry_cfg.deadline_seconds,
                    )
                else:
                    raw = call_llm(
                        prompt,
                        system=role_def.system_prompt or self.prompt_config.developer_execute_system,
                        model=model,
                    )

                cost = CostTracker.estimate_cost_rough(model, "high")
                self.budget.record_cost(cost)
                item.actual_cost += cost

                item.artifacts["output"] = raw
                self.work_items.request_review(item.id)

                self._log("execute_done", {
                    "item_id": item.id, "title": item.title, "cost": round(cost, 4),
                })
                self.events.emit(CompanyEvent.WORK_ITEM_DONE, {
                    "item_id": item.id, "title": item.title, "cost": round(cost, 4),
                })
                return  # 成功，退出

            except asyncio.TimeoutError:
                last_error = f"執行超時（{retry_cfg.deadline_seconds}s）"
                logger.warning("工作項 %s 超時（attempt %d/%d）", item.id, attempt + 1, retry_cfg.max_retries + 1)
            except Exception as exc:  # noqa: BLE001 - 重試兜底：記錄失敗後繼續下一輪
                last_error = str(exc)
                logger.warning("工作項 %s 失敗（attempt %d/%d）：%s", item.id, attempt + 1, retry_cfg.max_retries + 1, exc)

            # 是否還有重試機會
            if attempt < retry_cfg.max_retries:
                backoff = retry_cfg.retry_backoff_base * (2 ** attempt)
                self.events.emit(CompanyEvent.WORK_ITEM_RETRY, {
                    "item_id": item.id, "attempt": attempt + 1, "backoff": backoff,
                })
                await asyncio.sleep(backoff)

        # ── 所有重試耗盡，嘗試角色升級 ──
        if retry_cfg.enable_escalation and role_type != RoleType.MANAGER:
            superior = self.config.get_superior(role_type)
            if superior and superior in self.config.roles:
                logger.info("工作項 %s 升級：%s → %s", item.id, role_type.value, superior.value)
                self.events.emit(CompanyEvent.WORK_ITEM_ESCALATE, {
                    "item_id": item.id, "from": role_type.value, "to": superior.value,
                })
                item.assignee = superior
                # 遞迴重試（最多一層升級）
                return await self._execute_single_item(goal, item)

        # 最終失敗
        logger.error("工作項 %s 最終失敗：%s", item.id, last_error)
        item.artifacts["error"] = last_error or "未知錯誤"
        self.work_items.block(item.id, f"執行失敗：{last_error}")
        self.events.emit(CompanyEvent.WORK_ITEM_ERROR, {
            "item_id": item.id, "title": item.title, "error": last_error,
        })

    async def _review_item(self, goal: str, item, max_rounds: int) -> None:
        """讓 Reviewer 審查工作項交付物。"""
        review_round = 0

        while review_round < max_rounds:
            review_round += 1
            current = self.work_items.get(item.id)
            if not current or current.status != WorkItemStatus.IN_REVIEW:
                break

            role_def = self.config.roles.get(RoleType.REVIEWER, STANDARD_ROLES[RoleType.REVIEWER])
            model = self.budget.resolve_model_for_tier(BudgetTier.REASONING)

            artifact_text = current.artifacts.get("output", str(current.artifacts))

            prompt = self.prompt_config.reviewer_review.format(
                goal=goal,
                title=current.title,
                description=current.description,
                artifact=artifact_text[:8000],  # 限制長度
            )

            try:
                raw = call_llm(
                    prompt,
                    system=role_def.system_prompt or self.prompt_config.reviewer_system,
                    model=model,
                )
                cost = CostTracker.estimate_cost_rough(model, "medium")
                self.budget.record_cost(cost)
                current.actual_cost += cost

                result = parse_json_response(raw)

                if result.get("approved", False):
                    self.work_items.complete(item.id, {
                        "review_result": result,
                        "review_rounds": review_round,
                    })
                    self._log("review_approved", {
                        "item_id": item.id,
                        "rounds": review_round,
                        "score": result.get("score"),
                    })
                    self.events.emit(CompanyEvent.REVIEW_PASS, {
                        "item_id": item.id, "rounds": review_round, "score": result.get("score"),
                    })
                    break
                else:
                    feedback = result.get("feedback", "需修改")
                    self.work_items.request_rework(item.id, feedback)
                    self._log("review_rework", {
                        "item_id": item.id,
                        "round": review_round,
                        "feedback": feedback[:200],
                    })
                    self.events.emit(CompanyEvent.REVIEW_REWORK, {
                        "item_id": item.id, "round": review_round, "feedback": feedback[:200],
                    })

                    # 重新執行（Developer 根據回饋修改）
                    await self._rework_item(goal, current, feedback)

            except Exception as exc:  # noqa: BLE001 - 審查異常不阻塞交付，記錄後退出審查迴圈
                logger.error("審查 %s 失敗：%s", item.id, exc)
                break

        # 達到最大輪數仍未通過 → 強制完成（附註未通過審查）
        current = self.work_items.get(item.id)
        if current and current.status != WorkItemStatus.DONE:
            # 若處於 EXECUTING 狀態，需先轉到 IN_REVIEW 再轉 DONE
            if current.status == WorkItemStatus.EXECUTING:
                self.work_items.transition(item.id, WorkItemStatus.IN_REVIEW)
            self.work_items.complete(item.id, {
                "force_completed": True,
                "reason": f"達到最大審查輪數 {max_rounds}",
            })
            self._log(
                "review_force_done",
                {
                    "item_id": item.id,
                    "max_rounds": max_rounds,
                    "reason": f"達到最大審查輪數 {max_rounds}，強制完成",
                },
                degraded=True,
                level=logging.INFO,
            )
            self.events.emit(CompanyEvent.REVIEW_FORCE_DONE, {
                "item_id": item.id, "max_rounds": max_rounds, "degraded": True,
            })

    async def _rework_item(self, goal: str, item, feedback: str) -> None:
        """讓 Developer 根據審查回饋修改交付物（含重試）。"""
        self.work_items.transition(item.id, WorkItemStatus.EXECUTING)

        role_type = item.assignee or RoleType.DEVELOPER
        role_def = self.config.roles.get(role_type)
        if role_def is None:
            role_def = STANDARD_ROLES.get(role_type, STANDARD_ROLES[RoleType.DEVELOPER])
        model = self.budget.resolve_model_for_tier(item.tier)

        context = self._build_context(item)

        prompt = f"""{self.prompt_config.developer_execute.format(
            goal=goal,
            role_name=role_def.name,
            title=item.title,
            description=item.description,
            context=context,
        )}

【審查回饋 - 請根據以下回饋修改】
{feedback}

請直接給出修改後的交付物："""

        # ── 重試迴圈 ──
        retry_cfg = self.config.retry_config
        last_error = None

        for attempt in range(retry_cfg.max_retries + 1):
            try:
                if retry_cfg.deadline_seconds > 0:
                    raw = await asyncio.wait_for(
                        asyncio.to_thread(
                            call_llm,
                            prompt,
                            system=role_def.system_prompt or self.prompt_config.developer_execute_system,
                            model=model,
                        ),
                        timeout=retry_cfg.deadline_seconds,
                    )
                else:
                    raw = call_llm(
                        prompt,
                        system=role_def.system_prompt or self.prompt_config.developer_execute_system,
                        model=model,
                    )
                cost = CostTracker.estimate_cost_rough(model, "high")
                self.budget.record_cost(cost)
                item.actual_cost += cost

                item.artifacts["output"] = raw
                self.work_items.request_review(item.id)

                self._log("rework_done", {
                    "item_id": item.id, "cost": round(cost, 4),
                })
                return

            except asyncio.TimeoutError:
                last_error = f"修改超時（{retry_cfg.deadline_seconds}s）"
            except Exception as exc:  # noqa: BLE001 - 重試兜底：記錄失敗後繼續下一輪
                last_error = str(exc)
                logger.warning("修改 %s 失敗（attempt %d/%d）：%s", item.id, attempt + 1, retry_cfg.max_retries + 1, exc)

            if attempt < retry_cfg.max_retries:
                backoff = retry_cfg.retry_backoff_base * (2 ** attempt)
                self.events.emit(CompanyEvent.WORK_ITEM_RETRY, {
                    "item_id": item.id, "attempt": attempt + 1, "backoff": backoff,
                })
                await asyncio.sleep(backoff)

        # 最終失敗
        logger.error("修改 %s 最終失敗：%s", item.id, last_error)
        self.work_items.block(item.id, f"修改失敗：{last_error}")

    # ═══════════════════════════════════════════════════════════
    # 階段 3：Synthesizer 整合
    # ═══════════════════════════════════════════════════════════

    async def _synthesize(self, goal: str) -> str:
        """讓 Synthesizer 整合所有已完成工作項的交付物。"""
        role_def = self.config.roles.get(
            RoleType.SYNTHESIZER, STANDARD_ROLES[RoleType.SYNTHESIZER]
        )
        model = self.budget.resolve_model_for_tier(BudgetTier.REASONING)

        artifacts_text = self._collect_artifacts()
        stats = self.work_items.get_stats()

        prompt = self.prompt_config.synthesizer_merge.format(
            goal=goal,
            artifacts=artifacts_text,
            total_items=stats["total"],
            completed_items=stats["done"],
            review_rounds=self._count_review_rounds(),
        )

        try:
            raw = call_llm(
                prompt,
                system=role_def.system_prompt or self.prompt_config.synthesizer_system,
                model=model,
            )
            cost = CostTracker.estimate_cost_rough(model, "high")
            self.budget.record_cost(cost)

            self._log("synthesize_done", {"cost": round(cost, 4)})
            return raw

        except Exception as exc:  # noqa: BLE001 - 降級兜底：整合失敗改為直接拼接產出
            logger.error("整合失敗：%s", exc)
            return self._collect_artifacts()  # 降級：直接拼接

    # ═══════════════════════════════════════════════════════════
    # 階段 4：Manager 最終審查
    # ═══════════════════════════════════════════════════════════

    async def _manager_final_review(self, goal: str, final_output: str) -> dict:
        """Manager 最終審查整合結果。"""
        model = self.budget.resolve_model_for_tier(BudgetTier.REASONING)
        stats = self.work_items.get_stats()

        prompt = self.prompt_config.manager_final_review.format(
            goal=goal,
            final_output=final_output[:8000],
            total_items=stats["total"],
            review_rounds=self._count_review_rounds(),
            total_cost=round(self.budget.task_spent, 4),
        )

        try:
            raw = call_llm(
                prompt,
                system=self.prompt_config.manager_decompose_system,
                model=model,
            )
            cost = CostTracker.estimate_cost_rough(model, "medium")
            self.budget.record_cost(cost)

            result = parse_json_response(raw)
            self._log("final_review_done", result)
            return result

        except Exception as exc:  # noqa: BLE001 - 降級兜底：審查異常時自動通過並留痕
            logger.error("最終審查失敗：%s", exc)
            # 降級路徑：審查異常時自動通過，但必須留下可追蹤的持久軌跡
            self._log(
                "final_review_degraded",
                {"error": str(exc), "approved": True, "summary": "自動通過"},
                degraded=True,
                level=logging.INFO,
            )
            self.events.emit(CompanyEvent.FINAL_REVIEW_DEGRADED, {
                "error": str(exc), "degraded": True,
            })
            return {"approved": True, "summary": "自動通過", "error": str(exc), "degraded": True}

    # ═══════════════════════════════════════════════════════════
    # 輔助方法
    # ═══════════════════════════════════════════════════════════

    def _build_context(self, item) -> str:
        """收集依賴工作項的交付物作為上下文。"""
        if not item.depends_on:
            return "（無依賴上下文）"
        parts = []
        for dep_id in item.depends_on:
            dep = self.work_items.get(dep_id)
            if dep and dep.status == WorkItemStatus.DONE:
                output = dep.artifacts.get("output", "")
                parts.append(
                    f"【依賴工作項：{dep.title}】\n{output[:1000]}"
                )
        return "\n\n".join(parts) if parts else "（無依賴上下文）"

    def _collect_artifacts(self) -> str:
        """收集所有已完成工作項的交付物。"""
        parts = []
        for item in self.work_items.list_all():
            if item.status == WorkItemStatus.DONE:
                output = item.artifacts.get("output", str(item.artifacts))
                review = item.artifacts.get("review_result", {})
                score = review.get("score", "N/A") if isinstance(review, dict) else "N/A"
                parts.append(
                    f"## {item.title}\n"
                    f"審查分數：{score}\n\n"
                    f"{output[:3000]}"
                )
        return "\n\n---\n\n".join(parts) if parts else "（無交付物）"

    def _count_review_rounds(self) -> int:
        """統計總審查輪數。"""
        total = 0
        for item in self.work_items.list_all():
            rounds = item.artifacts.get("review_rounds", 0)
            if isinstance(rounds, (int, float)):
                total += int(rounds)
        return total

    def _log(
        self,
        event: str,
        data: dict[str, Any],
        *,
        degraded: bool = False,
        level: int = logging.DEBUG,
    ) -> None:
        """記錄運行事件（記憶體日誌 + 持久 JSONL sink）。

        每筆記錄帶 run_id / UTC 時間戳 / degraded 標記；
        降級與關鍵事件提升為 INFO 級結構化日誌。
        """
        entry = {
            "ts": utc_now_iso(),
            "run_id": self._run_id,
            "event": event,
            "degraded": degraded,
            **data,
        }
        self._run_log.append(entry)
        append_run_record(entry)
        if degraded:
            level = max(level, logging.INFO)
        logger.log(level, "公司事件：%s %s", event, entry)

    def _persist_bus_event(self, event: CompanyEvent, data: dict[str, Any]) -> None:
        """EventBus 監聽器：將生命週期事件同步寫入持久軌跡 sink。"""
        payload = dict(data)
        record = {
            "ts": utc_now_iso(),
            "run_id": self._run_id,
            "source": "eventbus",
            "event": event.value,
            "degraded": bool(payload.get("degraded", False)),
            **payload,
        }
        append_run_record(record)

    def _error_result(self, message: str) -> dict[str, Any]:
        """產出錯誤結果。"""
        return {
            "success": False,
            "run_id": self._run_id,
            "error": message,
            "kanban": self.work_items.get_kanban(),
            "budget": self.budget.to_dict(),
            "run_log": self._run_log,
        }