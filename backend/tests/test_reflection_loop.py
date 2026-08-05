"""Task 1.5：反思迴圈單元測試（使用模擬 LLM 回覆）。

驗證三條關鍵路徑：
1. 高分時直接輸出，不觸發反思
2. 低分時觸發反思 → 改進 → 重新評估
3. 持續低分時，達到最大迭代次數即停止（不無限迴圈）
"""

import json
from unittest.mock import MagicMock, patch

from backend.core.graph import build_graph


class FakeLLM:
    """依序回傳預設腳本的模擬 LLM。"""

    def __init__(self, responses: list[str]):
        self.responses = responses
        self.prompts: list[str] = []

    def __call__(self, prompt, system=None, model=None, **kwargs):
        self.prompts.append(prompt)
        if len(self.prompts) > len(self.responses):
            raise AssertionError(f"LLM 被呼叫超過預期的 {len(self.responses)} 次")
        return self.responses[len(self.prompts) - 1]


def _evaluation(score: float, weaknesses: str = "") -> str:
    return json.dumps(
        {"score": score, "strengths": "ok", "weaknesses": weaknesses},
        ensure_ascii=False,
    )


def _reflection() -> str:
    return json.dumps(
        {"critique": "缺少具體步驟", "suggestion": "補充操作細節"},
        ensure_ascii=False,
    )


def test_high_score_finalizes_without_reflection():
    fake = FakeLLM(["這是初始回答。", _evaluation(9)])
    with (
        patch("backend.core.nodes.call_llm", side_effect=fake),
        patch("backend.core.nodes._memory_store") as mock_store,
    ):
        mock_store.search_similar.return_value = []
        result = build_graph().invoke({"query": "測試問題"})

    assert result["final_answer"] == "這是初始回答。"
    assert result["score"] == 9.0
    assert not result.get("reflections")
    assert result["memory_saved"] is False
    # 只應有「生成 + 評估」兩次 LLM 呼叫
    assert len(fake.prompts) == 2
    # 應呼叫了記憶檢索
    mock_store.search_similar.assert_called_once()


def test_low_score_triggers_reflection_loop():
    fake = FakeLLM(
        [
            "初始回答（品質不佳）",
            _evaluation(5, "不完整"),
            _reflection(),
            "改進後的回答",
            _evaluation(9),
        ]
    )
    store = MagicMock()
    store.search_similar.return_value = []
    with (
        patch("backend.core.nodes.call_llm", side_effect=fake),
        patch("backend.core.nodes._memory_store", store),
    ):
        result = build_graph().invoke({"query": "測試問題"})

    assert result["final_answer"] == "改進後的回答"
    assert result["iteration"] == 1
    assert len(result["reflections"]) == 1
    assert result["reflections"][0]["critique"] == "缺少具體步驟"
    assert result["memory_saved"] is True
    store.add_memory.assert_called_once()


def test_loop_stops_at_max_iterations():
    # 評分永遠低分：generate + 4 次評估 + 3 輪（反思 + 改進）
    responses = ["初始回答"]
    for i in range(3):
        responses += [_evaluation(3, "很差"), _reflection(), f"改進回答{i + 1}"]
    responses.append(_evaluation(3, "很差"))
    fake = FakeLLM(responses)
    store = MagicMock()
    store.search_similar.return_value = []
    with (
        patch("backend.core.nodes.call_llm", side_effect=fake),
        patch("backend.core.nodes._memory_store", store),
    ):
        result = build_graph().invoke({"query": "測試問題"})

    # 達最大迭代後強制收尾，最終回答為最後一次改進版本
    assert result["final_answer"] == "改進回答3"
    assert result["iteration"] == 3
    assert len(result["reflections"]) == 3
    assert len(fake.prompts) == 11


def test_memory_retrieval_injects_similar_experiences():
    """驗證檢索到的相似經驗會被注入到生成節點的 prompt 中。"""
    fake = FakeLLM(["基於經驗的回答。", _evaluation(9)])
    with (
        patch("backend.core.nodes.call_llm", side_effect=fake),
        patch("backend.core.nodes._memory_store") as mock_store,
    ):
        mock_store.search_similar.return_value = [
            {"text": "過往成功經驗：問題X → 答案Y", "metadata": {}, "distance": 0.1},
            {"text": "過往成功經驗：問題Z → 答案W", "metadata": {}, "distance": 0.2},
        ]
        result = build_graph().invoke({"query": "測試問題"})

    assert result["final_answer"] == "基於經驗的回答。"
    assert result["retrieved_memories"] == [
        "過往成功經驗：問題X → 答案Y",
        "過往成功經驗：問題Z → 答案W",
    ]
    # 檢視生成 prompt 中是否包含記憶上下文
    assert "過往成功經驗" in fake.prompts[0]