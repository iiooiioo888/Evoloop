"""EvoLoop LangGraph 節點實作（Task 1.3 / 1.4 / 8.6）。

每個節點接收 EvoLoopState，回傳需要更新的部份欄位。
"""

import asyncio
import json
import logging

from backend.core.llm import call_llm, parse_json_response
from backend.core.state import EvoLoopState
from backend.memory.vector_store import VectorMemoryStore
from backend.prompts import templates
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
        query=state["query"],
        history_context=_format_history(state.get("history", [])),
        memory_context=_format_memories(state.get("retrieved_memories", [])),
    )
    answer = call_llm(prompt, system=templates.GENERATE_INITIAL_ANSWER_SYSTEM)
    return {"initial_answer": answer, "current_answer": answer, "iteration": 0}


def evaluate_answer(state: EvoLoopState) -> dict:
    """節點 2：自動評估目前回答，產出 0-10 分與評語。"""
    prompt = templates.EVALUATE_ANSWER.format(
        query=state["query"], answer=state["current_answer"]
    )
    raw = call_llm(prompt)
    try:
        evaluation = parse_json_response(raw)
        score = max(0.0, min(10.0, float(evaluation.get("score", 0))))
    except (json.JSONDecodeError, ValueError, TypeError):
        logger.warning("評估結果解析失敗，以 0 分觸發反思：%s", raw)
        evaluation = {"score": 0, "strengths": "", "weaknesses": "評估輸出無法解析"}
        score = 0.0
    return {"score": score, "evaluation": evaluation}


def reflect(state: EvoLoopState) -> dict:
    """節點 3：針對低分回答進行反思，產出根因分析與改進建議。"""
    prompt = templates.REFLECT.format(
        query=state["query"],
        answer=state["current_answer"],
        score=state.get("score", 0),
        evaluation=json.dumps(state.get("evaluation", {}), ensure_ascii=False),
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
    """節點 5：決定最終回答（通過門檻的最新版本）。"""
    return {"final_answer": state.get("current_answer", "")}


def save_memory(state: EvoLoopState) -> dict:
    """節點 6：將反思成功的經驗嵌入並存入向量記憶庫。

    只保存經歷過反思改進並最終通過的案例；一次通過的
    回答學習價值較低，暫不儲存。
    """
    if not state.get("reflections"):
        return {"memory_saved": False}
    last = state["reflections"][-1]
    text = (
        f"問題：{state['query']}\n"
        f"反思：{last['critique']}\n"
        f"最終答案：{state.get('final_answer', '')}"
    )
    try:
        _memory_store.add_memory(
            text,
            metadata={"score": state.get("score"), "iterations": state.get("iteration", 0)},
        )
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
