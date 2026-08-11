"""EvoLoop 統一模式圖定義（單一管線：反思閉環 + 公司運行時 + OPC 整合）。

統一模式下不再區分「標準/公司/OPC」三種模式，所有任務
進入同一條 EvoLoop 管線，由系統自動判斷執行策略：

流程：
  START → retrieve_memories → enhance_with_opc_context → route_by_complexity
    → 複雜任務：run_company → should_evaluate_company
        → 成功：evaluate_answer → should_improve
            → (score < 門檻 且 未達最大迭代) → reflect → improve_answer → evaluate_answer（迴圈）
            → 否則 → decide_final_answer → save_memory → archive_state → END
        → 失敗：archive_state → END
    → 簡單任務：generate_initial_answer → evaluate_answer → should_improve
        → (score < 門檻 且 未達最大迭代) → reflect → improve_answer → evaluate_answer（迴圈）
        → 否則 → decide_final_answer → save_memory → archive_state → END

執行策略（execution_strategy）：
  - "auto"（預設）: 依規則自動判斷複雜度
  - "simple": 強制單次 LLM 生成
  - "company": 強制多代理人公司運行時
"""

import os

from langgraph.graph import END, START, StateGraph

from backend.core import nodes
from backend.core.company_nodes import (
    enhance_with_opc_context,
    route_by_complexity,
    run_company,
    should_evaluate_company,
)
from backend.core.state import EvoLoopState

# 可透過環境變數調整；測試中也可 monkeypatch 此模組常數
PASS_THRESHOLD = float(os.getenv("EVOL_PASS_THRESHOLD", "8"))
MAX_ITERATIONS = int(os.getenv("EVOL_MAX_ITERATIONS", "3"))


def should_improve(state: EvoLoopState) -> str:
    """條件路由：評分 < 門檻且迭代次數未達上限 → reflect，否則 finalize。"""
    score = state.get("score", 0.0)
    iteration = state.get("iteration", 0)
    if score < PASS_THRESHOLD and iteration < MAX_ITERATIONS:
        return "reflect"
    return "finalize"


def build_graph():
    """組裝並編譯 EvoLoop 統一模式圖。"""
    graph = StateGraph(EvoLoopState)

    # ── 共用節點 ──
    graph.add_node("retrieve_memories", nodes.retrieve_memories)
    graph.add_node("enhance_with_opc_context", enhance_with_opc_context)

    # ── 公司運行時節點 ──
    graph.add_node("run_company", run_company)

    # ── 生成/評估/反思節點 ──
    graph.add_node("generate_initial_answer", nodes.generate_initial_answer)
    graph.add_node("evaluate_answer", nodes.evaluate_answer)
    graph.add_node("reflect", nodes.reflect)
    graph.add_node("improve_answer", nodes.improve_answer)
    graph.add_node("decide_final_answer", nodes.decide_final_answer)
    graph.add_node("save_memory", nodes.save_memory)
    graph.add_node("archive_state", nodes.archive_state)

    # ── 統一管線入口 ──
    # START → 記憶檢索 → OPC 上下文增強 → 複雜度路由
    graph.add_edge(START, "retrieve_memories")
    graph.add_edge("retrieve_memories", "enhance_with_opc_context")
    graph.add_conditional_edges(
        "enhance_with_opc_context",
        route_by_complexity,
        {
            "run_company": "run_company",
            "generate_initial_answer": "generate_initial_answer",
        },
    )

    # ── 公司運行時路徑 ──
    # run_company → should_evaluate_company
    #   成功 → evaluate_answer（進入評估/反思/改進迭代迴圈）
    #   失敗 → archive_state → END（跳過迭代）
    graph.add_conditional_edges(
        "run_company",
        should_evaluate_company,
        {"evaluate_answer": "evaluate_answer", "archive_state": "archive_state"},
    )

    # ── 簡單任務路徑 ──
    graph.add_edge("generate_initial_answer", "evaluate_answer")

    # ── 反思迭代迴圈（兩條路徑共用） ──
    graph.add_conditional_edges(
        "evaluate_answer",
        should_improve,
        {"reflect": "reflect", "finalize": "decide_final_answer"},
    )
    graph.add_edge("reflect", "improve_answer")
    graph.add_edge("improve_answer", "evaluate_answer")
    graph.add_edge("decide_final_answer", "save_memory")
    graph.add_edge("save_memory", "archive_state")
    graph.add_edge("archive_state", END)

    return graph.compile()


# 供 API 層直接使用的編譯圖實例
evoloop_graph = build_graph()