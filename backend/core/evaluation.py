"""多維度評估引擎（優化 #1）。

提供：
1. MultiDimensionalEvaluator: 4 維度獨立評分（準確性/完整性/清晰度/相關性）
2. RuleBasedFallback: LLM 評估失敗時的規則啟發式評分
3. CrossModelEvaluator: 不同模型交叉評估，打破自評偏差

評分流程：
  LLM 多維度評估 → 解析成功 → 加權總分
                 → 解析失敗 → 規則 fallback
  可選：交叉評估（第二模型覆核）
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from backend.core.llm import call_llm, parse_json_response

logger = logging.getLogger(__name__)

# ── 維度權重（總和 = 1.0）──
DIMENSION_WEIGHTS = {
    "accuracy": 0.35,
    "completeness": 0.30,
    "clarity": 0.20,
    "relevance": 0.15,
}

DIMENSION_NAMES = list(DIMENSION_WEIGHTS.keys())

# ── Prompt 模板 ──
MULTI_DIM_EVALUATE_PROMPT = """你是一位嚴格的回答品質審查員。請從以下 4 個維度獨立評估回答品質。

【使用者問題】
{query}

【待評估回答】
{answer}

請對每個維度給出 0-10 分（一位小數）和簡短評語：
1. 準確性（accuracy）：資訊是否正確、有無事實錯誤
2. 完整性（completeness）：是否涵蓋問題的所有關鍵要點
3. 清晰度（clarity）：表達是否清楚、結構是否合理
4. 相關性（relevance）：是否切題、有無偏題或冗餘

只輸出 JSON，格式如下：
{{
  "accuracy": {{"score": <0-10>, "reason": "<評語>"}},
  "completeness": {{"score": <0-10>, "reason": "<評語>"}},
  "clarity": {{"score": <0-10>, "reason": "<評語>"}},
  "relevance": {{"score": <0-10>, "reason": "<評語>"}}
}}"""

CROSS_MODEL_PROMPT = """你是另一位審查員，請覆核以下評估結果是否合理。

【使用者問題】
{query}

【回答】
{answer}

【原評估】
{original_evaluation}

你是否同意原評估？若不同意，請給出你認為更準確的評分。
只輸出 JSON：
{{
  "agree": true/false,
  "override_scores": {{"accuracy": <0-10>, "completeness": <0-10>, "clarity": <0-10>, "relevance": <0-10>}},
  "reason": "<覆核理由>"
}}"""


@dataclass
class DimensionResult:
    """單維度評估結果。"""
    score: float
    reason: str


@dataclass
class EvaluationResult:
    """多維度評估完整結果。"""
    accuracy: DimensionResult = field(default_factory=lambda: DimensionResult(0.0, ""))
    completeness: DimensionResult = field(default_factory=lambda: DimensionResult(0.0, ""))
    clarity: DimensionResult = field(default_factory=lambda: DimensionResult(0.0, ""))
    relevance: DimensionResult = field(default_factory=lambda: DimensionResult(0.0, ""))
    overall: float = 0.0
    source: str = "llm"  # "llm" | "rule_fallback" | "cross_model"

    def to_dict(self) -> dict[str, Any]:
        return {
            "accuracy": {"score": self.accuracy.score, "reason": self.accuracy.reason},
            "completeness": {"score": self.completeness.score, "reason": self.completeness.reason},
            "clarity": {"score": self.clarity.score, "reason": self.clarity.reason},
            "relevance": {"score": self.relevance.score, "reason": self.relevance.reason},
            "overall": round(self.overall, 2),
            "source": self.source,
        }

    @staticmethod
    def from_dict(data: dict[str, Any]) -> EvaluationResult:
        result = EvaluationResult()
        for dim in DIMENSION_NAMES:
            dim_data = data.get(dim, {})
            if isinstance(dim_data, dict):
                setattr(result, dim, DimensionResult(
                    score=float(dim_data.get("score", 0)),
                    reason=str(dim_data.get("reason", "")),
                ))
        result.overall = float(data.get("overall", 0))
        result.source = str(data.get("source", "llm"))
        return result


class MultiDimensionalEvaluator:
    """多維度評估器。"""

    def evaluate(self, query: str, answer: str) -> EvaluationResult:
        """執行 LLM 多維度評估，失敗時降級為規則評估。"""
        try:
            prompt = MULTI_DIM_EVALUATE_PROMPT.format(query=query, answer=answer)
            raw = call_llm(prompt)
            data = parse_json_response(raw)
            return self._parse_evaluation(data, source="llm")
        except Exception as exc:
            logger.warning("LLM 多維度評估失敗，降級為規則評估：%s", exc)
            return RuleBasedFallback.evaluate(query, answer)

    def _parse_evaluation(self, data: dict, source: str = "llm") -> EvaluationResult:
        """解析 LLM 評估 JSON，容錯處理。"""
        result = EvaluationResult(source=source)
        for dim in DIMENSION_NAMES:
            dim_data = data.get(dim, {})
            if isinstance(dim_data, dict):
                score = max(0.0, min(10.0, float(dim_data.get("score", 0))))
                reason = str(dim_data.get("reason", ""))
            elif isinstance(dim_data, (int, float)):
                score = max(0.0, min(10.0, float(dim_data)))
                reason = ""
            else:
                score = 0.0
                reason = "解析失敗"
            setattr(result, dim, DimensionResult(score=score, reason=reason))

        # 加權總分
        result.overall = sum(
            getattr(result, dim).score * weight
            for dim, weight in DIMENSION_WEIGHTS.items()
        )
        # 向後相容：舊版 {"score": 9, "strengths": "..."} 沒有四維欄位
        if result.overall == 0:
            legacy = data.get("overall", data.get("score"))
            try:
                score = max(0.0, min(10.0, float(legacy))) if legacy is not None else 0.0
            except (TypeError, ValueError):
                score = 0.0
            if score > 0:
                reason = str(data.get("strengths") or data.get("weaknesses") or "legacy")
                for dim in DIMENSION_NAMES:
                    setattr(result, dim, DimensionResult(score=score, reason=reason))
                result.overall = score
        return result


class RuleBasedFallback:
    """規則啟發式評估（LLM 失敗時的降級方案）。

    使用可量化的規則評估回答品質，不依賴 LLM。
    """

    @staticmethod
    def evaluate(query: str, answer: str) -> EvaluationResult:
        """基於規則評估回答品質。"""
        result = EvaluationResult(source="rule_fallback")

        # 準確性：基於回答長度和結構
        result.accuracy = RuleBasedFallback._score_accuracy(query, answer)
        # 完整性：基於關鍵詞覆蓋率
        result.completeness = RuleBasedFallback._score_completeness(query, answer)
        # 清晰度：基於結構指標
        result.clarity = RuleBasedFallback._score_clarity(answer)
        # 相關性：基於查詢詞命中率
        result.relevance = RuleBasedFallback._score_relevance(query, answer)

        result.overall = sum(
            getattr(result, dim).score * weight
            for dim, weight in DIMENSION_WEIGHTS.items()
        )
        return result

    @staticmethod
    def _score_accuracy(query: str, answer: str) -> DimensionResult:
        """準確性評估：回答不應過短或過長，不應包含不確定性標記。"""
        score = 6.0  # 基線分
        reasons = []

        # 長度檢查
        if len(answer) < 20:
            score -= 3.0
            reasons.append("回答過短")
        elif len(answer) > 5000:
            score -= 1.0
            reasons.append("回答過長，可能包含冗餘")

        # 不確定性標記
        uncertainty_patterns = [
            r"我不[確确]定", r"可能不準", r"僅供參考", r"我不確定",
            r"I'm not sure", r"might be wrong", r"不确定",
        ]
        for pattern in uncertainty_patterns:
            if re.search(pattern, answer, re.IGNORECASE):
                score -= 1.5
                reasons.append("包含不確定性標記")
                break

        # 重複內容檢測
        sentences = [s.strip() for s in re.split(r'[。！？\n]', answer) if s.strip()]
        if len(sentences) > 3:
            unique_ratio = len(set(sentences)) / len(sentences)
            if unique_ratio < 0.6:
                score -= 2.0
                reasons.append("大量重複內容")

        return DimensionResult(
            score=max(0.0, min(10.0, score)),
            reason="；".join(reasons) if reasons else "基本規則通過",
        )

    @staticmethod
    def _score_completeness(query: str, answer: str) -> DimensionResult:
        """完整性評估：查詢關鍵詞在回答中的覆蓋率。"""
        # 提取查詢中的關鍵詞（去除停用詞）
        stop_words = {
            "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都",
            "一", "一個", "上", "也", "很", "到", "說", "要", "去", "你",
            "會", "著", "沒有", "看", "好", "自己", "這", "他", "她", "它",
            "the", "a", "an", "is", "are", "was", "were", "be", "been",
            "being", "have", "has", "had", "do", "does", "did", "will",
            "would", "could", "should", "may", "might", "can", "to", "of",
            "in", "for", "on", "with", "at", "by", "from", "as", "into",
            "about", "請", "问", "問", "什么", "什麼", "怎么", "怎麼",
            "如何", "哪些", "哪个", "哪個", "嗎", "吗", "呢", "吧",
        }
        query_words = set(re.findall(r'[\w\u4e00-\u9fff]+', query.lower()))
        query_words -= stop_words

        if not query_words:
            return DimensionResult(score=6.0, reason="無法提取查詢關鍵詞")

        answer_lower = answer.lower()
        covered = sum(1 for w in query_words if w in answer_lower)
        coverage = covered / len(query_words)

        score = 3.0 + coverage * 7.0  # 3-10 分
        reason = f"關鍵詞覆蓋率 {coverage:.0%}（{covered}/{len(query_words)}）"

        return DimensionResult(
            score=max(0.0, min(10.0, score)),
            reason=reason,
        )

    @staticmethod
    def _score_clarity(answer: str) -> DimensionResult:
        """清晰度評估：結構化指標。"""
        score = 6.0
        reasons = []

        # 段落結構
        paragraphs = [p.strip() for p in answer.split('\n\n') if p.strip()]
        if len(paragraphs) >= 2:
            score += 1.0
            reasons.append("有段落分隔")
        elif len(answer) > 500 and len(paragraphs) < 2:
            score -= 1.0
            reasons.append("長回答缺乏段落結構")

        # 列表/編號
        list_patterns = [r'^\d+[\.\)、]', r'^[-•*]\s', r'^第[一二三四五六七八九十]']
        has_list = any(
            re.search(p, line, re.MULTILINE)
            for p in list_patterns
            for line in answer.split('\n')
        )
        if has_list:
            score += 1.0
            reasons.append("使用列表結構")

        # 標題
        has_heading = bool(re.search(r'^#{1,3}\s|^[一二三四五六七八九十]+[、.]', answer, re.MULTILINE))
        if has_heading:
            score += 0.5
            reasons.append("有標題層級")

        # 過長單句
        long_sentences = [s for s in re.split(r'[。！？\n]', answer) if len(s) > 200]
        if long_sentences:
            score -= 1.0
            reasons.append(f"{len(long_sentences)} 個過長句子")

        return DimensionResult(
            score=max(0.0, min(10.0, score)),
            reason="；".join(reasons) if reasons else "基本結構通過",
        )

    @staticmethod
    def _score_relevance(query: str, answer: str) -> DimensionResult:
        """相關性評估：查詢意圖與回答的匹配度。"""
        score = 6.0
        reasons = []

        # 查詢類型匹配
        query_lower = query.lower()
        answer_lower = answer.lower()

        # 問句類型檢查
        if any(w in query_lower for w in ["怎么", "怎麼", "如何", "how"]):
            if any(w in answer_lower for w in ["步骤", "步驟", "方法", "首先", "第一", "step"]):
                score += 1.5
                reasons.append("問題類型匹配（how-to）")

        if any(w in query_lower for w in ["什么是", "什麼是", "是什么", "what is"]):
            if any(w in answer_lower for w in ["是", "指", "定义", "定義", "means", "refers"]):
                score += 1.0
                reasons.append("問題類型匹配（定義）")

        # 偏題檢查：回答中出現大量與查詢無關的長段落
        query_chars = set(re.findall(r'[\u4e00-\u9fff]', query))
        if query_chars and len(answer) > 200:
            answer_chars = set(re.findall(r'[\u4e00-\u9fff]', answer))
            overlap = len(query_chars & answer_chars) / len(query_chars)
            if overlap < 0.3:
                score -= 2.0
                reasons.append("回答與查詢關聯度低")

        return DimensionResult(
            score=max(0.0, min(10.0, score)),
            reason="；".join(reasons) if reasons else "基本相關性通過",
        )


class CrossModelEvaluator:
    """交叉評估器：用不同模型覆核評估結果，打破自評偏差。"""

    @staticmethod
    def cross_evaluate(
        query: str,
        answer: str,
        original_evaluation: dict[str, Any],
        cross_model: str | None = None,
    ) -> EvaluationResult | None:
        """用第二個模型覆核評估結果。

        Args:
            query: 使用者問題
            answer: 待評估回答
            original_evaluation: 原始多維度評估結果
            cross_model: 覆核模型（None 時使用環境變數配置）

        Returns:
            覆核後的評估結果，失敗時回傳 None（保留原始評估）
        """
        if not cross_model:
            import os
            cross_model = os.getenv("EVOL_CROSS_EVAL_MODEL")
            if not cross_model:
                return None  # 未配置覆核模型，跳過

        try:
            prompt = CROSS_MODEL_PROMPT.format(
                query=query,
                answer=answer,
                original_evaluation=json.dumps(original_evaluation, ensure_ascii=False, indent=2),
            )
            raw = call_llm(prompt, model=cross_model)
            data = parse_json_response(raw)

            if not data.get("agree", True):
                # 覆核模型不同意，使用覆核分數
                override = data.get("override_scores", {})
                result = EvaluationResult(source="cross_model")
                for dim in DIMENSION_NAMES:
                    score = max(0.0, min(10.0, float(override.get(dim, 0))))
                    setattr(result, dim, DimensionResult(score=score, reason="交叉評估覆核"))
                result.overall = sum(
                    getattr(result, dim).score * weight
                    for dim, weight in DIMENSION_WEIGHTS.items()
                )
                logger.info(
                    "交叉評估覆核：原分 %.1f → 新分 %.1f（理由：%s）",
                    original_evaluation.get("overall", 0),
                    result.overall,
                    data.get("reason", ""),
                )
                return result

            return None  # 覆核模型同意，保留原始評估

        except Exception as exc:
            logger.warning("交叉評估失敗（保留原始評估）：%s", exc)
            return None


# ── 模組級單例 ──
_evaluator: MultiDimensionalEvaluator | None = None


def get_evaluator() -> MultiDimensionalEvaluator:
    """取得全域評估器單例。"""
    global _evaluator
    if _evaluator is None:
        _evaluator = MultiDimensionalEvaluator()
    return _evaluator
