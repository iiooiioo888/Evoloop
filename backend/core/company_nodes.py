"""EvoLoop 公司運行時節點（Phase 6+ 多代理人擴展）。

新增以下節點，讓 EvoLoop 反思迴圈可以切換到公司模式：
- route_to_company: 判斷是否啟用公司模式
- run_company: 執行完整公司運行流程，將產出設為 current_answer
- should_evaluate_company: 公司執行後路由（成功→評估迭代，失敗→直接存檔）
- collect_company_result: 將公司運行結果合併回 EvoLoop 狀態

公司模式 vs 標準模式：
- 標準模式：單一 LLM 問答，反思改進
- 公司模式：多角色分工產出後，同樣進入評估 → 反思 → 改進迭代迴圈
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from backend.company.orchestrator import CompanyOrchestrator
from backend.company.roles import BUILTIN_TEMPLATES
from backend.core.state import EvoLoopState

logger = logging.getLogger(__name__)


def route_to_company(state: EvoLoopState) -> str:
    """條件路由：判斷是否啟用公司模式。

    若 state 中 company_mode=True，則走公司流程；
    否則走標準 EvoLoop 反思迴圈。
    """
    if state.get("company_mode", False):
        return "run_company"
    return "generate_initial_answer"


def run_company(state: EvoLoopState) -> dict[str, Any]:
    """執行公司模式：多角色分工完成目標。

    成功時將公司產出設為 current_answer，交由 evaluate_answer
    進入反思迭代迴圈（與標準模式共用同一評估/反思/改進管線）；
    失敗時直接設定 final_answer 並跳過迭代。

    這是同步包裝器，內部使用 asyncio.run 呼叫非同步協調器。
    """
    query = state.get("query", "")
    template_name = state.get("company_template", "quick_task")

    # 選擇組織架構模板
    config = BUILTIN_TEMPLATES.get(template_name)
    if config is None:
        logger.warning("未知模板 %s，使用 quick_task", template_name)
        config = BUILTIN_TEMPLATES["quick_task"]

    orchestrator = CompanyOrchestrator(config)

    try:
        # 在同步節點中執行非同步協調器
        try:
            loop = asyncio.get_running_loop()
            # 已有事件迴圈，建立新任務
            result = asyncio.run_coroutine_threadsafe(
                orchestrator.execute(query), loop
            ).result(timeout=300)
        except RuntimeError:
            # 無事件迴圈，使用 asyncio.run
            result = asyncio.run(orchestrator.execute(query))

        final_output = result.get("final_output", "")

        # 成功：將產出設為 current_answer，交由 evaluate_answer 評估迭代
        return {
            "current_answer": final_output,
            "company_result": result,
            "company_kanban": result.get("kanban", {}),
            "company_budget": result.get("budget", {}),
            "iteration": 0,
        }

    except Exception as exc:  # noqa: BLE001 - 降級兜底：公司模式失敗不中斷主流程
        logger.error("公司模式執行失敗：%s", exc)
        # 失敗：直接設定 final_answer，跳過評估迭代
        return {
            "final_answer": f"公司模式執行失敗：{exc}",
            "company_result": {"success": False, "error": str(exc)},
            "company_kanban": {},
            "company_budget": {},
            "iteration": 0,
            "score": 0.0,
            "evaluation": {"score": 0, "strengths": "", "weaknesses": str(exc)},
        }


def should_evaluate_company(state: EvoLoopState) -> str:
    """公司模式執行後路由：成功則進入評估迭代迴圈，失敗則直接存檔。

    與 should_improve 配合，構成公司模式的完整迭代路徑：
      run_company → should_evaluate_company
        → 成功：evaluate_answer → should_improve → reflect/improve（迴圈） → finalize
        → 失敗：archive_state → END
    """
    company_result = state.get("company_result", {})
    if company_result.get("success", False):
        return "evaluate_answer"
    return "archive_state"


def collect_company_result(state: EvoLoopState) -> dict[str, Any]:
    """將公司運行結果合併到最終狀態（讀取用，無需修改）。"""
    return {}