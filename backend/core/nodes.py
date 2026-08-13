"""EvoLoop LangGraph 節點實作（Task 1.3 / 1.4 / 8.6）。

每個節點接收 EvoLoopState，回傳需要更新的部份欄位。
"""

import asyncio
import json
import logging

from backend.core.evaluation import CrossModelEvaluator, get_evaluator
from backend.core.llm import call_llm, parse_json_response
from backend.core.state import EvoLoopState
from backend.memory.vector_store import VectorMemoryStore
from backend.prompts import templates
from backend.prompts.templates import truncate
from backend.services.archiver import save_session_archive, save_session_archive_sync

logger = logging.getLogger(__name__)

# Phase 2：使用 ChromaDB 向量記憶庫
_memory_store = VectorMemoryStore()


def _format_history(history: list[dict[str, str]]) -> str:
    """將多輪對話歷史格式化為 Prompt 區塊。"""
    if not history:
        return ""
    lines = ["【對話歷史】"]
    for turn in history[-6:]:  # 最多帶入最近 6 輪
        role = "使用者" if turn.get("role") == "user" else "助手"
        lines.append(f"{role}：{turn.get('content', '')}")
    return "\n".join(lines) + "\n"


def _format_memories(memories: list[str]) -> str:
    """將檢索到的相似經驗格式化為 few-shot 參考區塊。"""
    if not memories:
        return ""
    lines = ["【可參考的過往成功經驗】"]
    for i, memory in enumerate(memories, 1):
        lines.append(f"{i}. {memory}")
    return "\n".join(lines) + "\n"


def retrieve_memories(state: EvoLoopState) -> dict:
    """節點 0：從向量記憶庫檢索與查詢相似的成功經驗。

    在生成回答前執行，將檢索結果注入 state 供
    generate_initial_answer 作為 few-shot 參考。
    """
    query = state.get("query", "")
    if not query:
        return {"retrieved_memories": []}
    try:
        results = _memory_store.search_similar(query, k=3)
        memories = [item["text"] for item in results]
        return {"retrieved_memories": memories}
    except Exception as exc:  # noqa: BLE001 - 檢索失敗不阻斷主流程
        logger.warning("記憶檢索失敗（跳過）：%s", exc)
        return {"retrieved_memories": []}


def generate_initial_answer(state: EvoLoopState) -> dict:
    """節點 1：生成初始回答。"""
    prompt = templates.GENERATE_INITIAL_ANSWER.format(
        query=truncate(state["query"], 2000),
        history_context=truncate(_format_history(state.get("history", [])), 2000),
        memory_context=truncate(_format_memories(state.get("retrieved_memories", [])), 2000),
    )
    answer = call_llm(prompt, system=templates.GENERATE_INITIAL_ANSWER_SYSTEM)
    return {"initial_answer": answer, "current_answer": answer, "iteration": 0}


def evaluate_answer(state: EvoLoopState) -> dict:
    """節點 2：多維度自動評估，產出 0-10 分與評語。

    評估流程（優化 #1）：
    1. LLM 多維度評估（4 維度獨立打分）
    2. 解析失敗 → 規則啟發式 fallback（不再一律 0 分）
    3. 可選：交叉評估（不同模型覆核，打破自評偏差）
    """
    query = state["query"]
    answer = state["current_answer"]

    # 截斷長回答以節省評估 token（優化 #14）
    truncated_answer = truncate(answer, 4000)

    # 多維度評估（內部已含規則 fallback）
    evaluator = get_evaluator()
    eval_result = evaluator.evaluate(query, truncated_answer)

    # 可選：交叉評估覆核
    cross_result = CrossModelEvaluator.cross_evaluate(
        query, answer, eval_result.to_dict()
    )
    if cross_result is not None:
        eval_result = cross_result

    score = eval_result.overall
    evaluation = eval_result.to_dict()

    # 向後相容：保留舊版 evaluation 格式
    legacy_evaluation = {
        "score": score,
        "strengths": f"準確性{eval_result.accuracy.score:.1f} 完整性{eval_result.completeness.score:.1f}",
        "weaknesses": f"清晰度{eval_result.clarity.score:.1f} 相關性{eval_result.relevance.score:.1f}",
    }

    return {
        "score": score,
        "evaluation": legacy_evaluation,
        "multi_dim_evaluation": evaluation,
    }


def reflect(state: EvoLoopState) -> dict:
    """節點 3：針對低分回答進行反思（優化 #4：分層反思）。

    分層策略：
    - 低分（< 5）：深度反思，傳入完整多維度評估 + 強調根因分析
    - 中分（5-8）：表面修正，傳入摘要評估 + 聚焦具體改進點
    """
    score = state.get("score", 0.0)
    multi_dim = state.get("multi_dim_evaluation", {})

    # 分層反思：根據分數選擇反思深度
    if score < 5.0:
        # 深度反思：傳入完整多維度評估細節
        eval_detail = json.dumps(multi_dim, ensure_ascii=False) if multi_dim else json.dumps(state.get("evaluation", {}), ensure_ascii=False)
        prompt = templates.REFLECT.format(
            query=state["query"],
            answer=state["current_answer"],
            score=score,
            evaluation=eval_detail,
        )
    else:
        # 表面修正：只傳入摘要，節省 token
        if multi_dim:
            eval_summary = {
                "overall": multi_dim.get("overall", 0),
                "weakest": min(
                    [(d, multi_dim.get(d, {}).get("score", 10)) for d in ("accuracy", "completeness", "clarity", "relevance")],
                    key=lambda x: x[1],
                )[0],
            }
            eval_detail = json.dumps(eval_summary, ensure_ascii=False)
        else:
            eval_detail = json.dumps(state.get("evaluation", {}), ensure_ascii=False)
        prompt = templates.REFLECT.format(
            query=state["query"],
            answer=state["current_answer"],
            score=score,
            evaluation=eval_detail,
        )

    raw = call_llm(prompt)
    try:
        result = parse_json_response(raw)
    except json.JSONDecodeError:
        # LLM 未遵守 JSON 格式時，將全文視為根因分析
        result = {"critique": raw, "suggestion": ""}
    return {
        "critique": result.get("critique", ""),
        "suggestion": result.get("suggestion", ""),
    }


def improve_answer(state: EvoLoopState) -> dict:
    """節點 4：根據反思結果優化回答，並累加迭代計數與反思紀錄。"""
    prompt = templates.IMPROVE_ANSWER.format(
        query=state["query"],
        answer=state["current_answer"],
        critique=state.get("critique", ""),
        suggestion=state.get("suggestion", ""),
    )
    improved = call_llm(prompt)
    iteration = state.get("iteration", 0) + 1
    reflections = list(state.get("reflections", []))
    reflections.append(
        {
            "iteration": iteration,
            "score": state.get("score", 0.0),
            "critique": state.get("critique", ""),
            "suggestion": state.get("suggestion", ""),
        }
    )
    return {"current_answer": improved, "iteration": iteration, "reflections": reflections}


def decide_final_answer(state: EvoLoopState) -> dict:
    """節點 5：決定最終回答並執行最終質量門檢查（優化 #16）。

    質量門：
    - 回答為空 → 使用初始回答降級
    - 回答過短（< 10 字）→ 標記警告
    - 回答與問題完全無關 → 標記警告
    """
    answer = state.get("current_answer", "")
    query = state.get("query", "")
    warnings: list[str] = []

    # 質量門 1：空回答降級
    if not answer or not answer.strip():
        answer = state.get("initial_answer", "")
        if answer:
            warnings.append("current_answer 為空，降級使用 initial_answer")
        else:
            warnings.append("所有回答為空")
            answer = "抱歉，無法生成有效回答，請嘗試重新表述問題。"

    # 質量門 2：過短回答
    if len(answer.strip()) < 10:
        warnings.append(f"回答過短（{len(answer.strip())} 字）")

    # 質量門 3：相關性粗檢（查詢詞命中率）
    if query and len(query) > 5:
        query_chars = set(c for c in query if '\u4e00' <= c <= '\u9fff')
        answer_chars = set(c for c in answer if '\u4e00' <= c <= '\u9fff')
        if query_chars and answer_chars:
            overlap = len(query_chars & answer_chars) / len(query_chars)
            if overlap < 0.1:
                warnings.append(f"回答與問題關聯度極低（{overlap:.0%}）")

    if warnings:
        logger.warning("質量門警告：%s", "；".join(warnings))

    return {"final_answer": answer, "quality_warnings": warnings}


def save_memory(state: EvoLoopState) -> dict:
    """節點 6：將經驗嵌入並存入向量記憶庫（優化 #5）。

    保存策略：
    - 經歷反思改進並通過的案例 → 保存反思過程（學習價值高）
    - 一次通過的高分回答（score >= 8）→ 也保存為正樣本
    - 低分一次通過的回答 → 不保存（噪音）
    """
    score = state.get("score", 0.0)
    reflections = state.get("reflections", [])

    if reflections:
        # 經歷反思改進的案例
        last = reflections[-1]
        text = (
            f"問題：{state['query']}\n"
            f"反思：{last['critique']}\n"
            f"最終答案：{state.get('final_answer', '')}"
        )
        metadata = {
            "score": score,
            "iterations": state.get("iteration", 0),
            "type": "reflection",
        }
    elif score >= 8.0:
        # 一次通過的高分回答 → 保存為正樣本
        text = (
            f"問題：{state['query']}\n"
            f"高分回答：{state.get('final_answer', '')}"
        )
        metadata = {
            "score": score,
            "iterations": 0,
            "type": "positive_sample",
        }
    else:
        return {"memory_saved": False}

    try:
        _memory_store.add_memory(text, metadata=metadata)
        return {"memory_saved": True}
    except Exception as exc:  # noqa: BLE001 - 儲存失敗不中斷主流程
        logger.warning("記憶儲存失敗：%s", exc)
        return {"memory_saved": False}


def archive_state(state: EvoLoopState) -> dict:
    """節點 7（Task 8.6）：將完整對話生命週期存檔為 JSONL。

    位於圖的最末端，確保狀態已完整；採盡力而為策略，
    存檔失敗只記警告，不影響已產出的最終回答。

    同步節點：目前線程無事件迴圈時以 asyncio.run 執行
    非同步寫入（LangGraph 的 ainvoke 會把同步節點放到
    工作執行緒，該處無事件迴圈，同樣安全）；若偵測到
    執行中的事件迴圈則降級為同步寫入。
    """
    session_id = state.get("session_id", "unknown")
    try:
        try:
            asyncio.run(save_session_archive(state, session_id))
        except RuntimeError:
            # 當前線程已有執行中的事件迴圈，改用同步寫入
            save_session_archive_sync(state, session_id)
        return {"archived": True}
    except Exception as exc:  # noqa: BLE001 - 存檔不應中斷主流程
        logger.warning("對話存檔失敗（不影響回應）：%s", exc)
        return {"archived": False}
