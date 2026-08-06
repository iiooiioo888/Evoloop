"""預算控制系統。

提供：
- BudgetManager: 追蹤任務/會話/月度花費，強制執行上限與降級
- TierRouter: 根據任務重要性與預算壓力選擇模型層級
- CostTracker: 估算 LLM 呼叫成本（token 計價）

所有金額以 USD 為單位。
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from backend.company.state import BudgetConfig, BudgetTier

logger = logging.getLogger(__name__)

# ── 模型每百萬 token 成本（USD） ──
# 實際價格請以供應商為準，此處為概估
_MODEL_COST_PER_1M_TOKENS: dict[str, tuple[float, float]] = {
    # (input_cost, output_cost) per 1M tokens
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4-turbo": (10.00, 30.00),
    "gpt-3.5-turbo": (0.50, 1.50),
    "claude-3-5-sonnet": (3.00, 15.00),
    "claude-3-haiku": (0.25, 1.25),
    "deepseek-chat": (0.14, 0.28),
    "deepseek-reasoner": (0.55, 2.19),
}


class CostTracker:
    """估算 LLM 呼叫成本。"""

    @staticmethod
    def estimate_cost(
        model: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> float:
        """根據 token 數估算成本（USD）。"""
        costs = _MODEL_COST_PER_1M_TOKENS.get(model)
        if costs is None:
            # 未知模型，使用保守估計
            costs = (1.0, 4.0)
        input_cost, output_cost = costs
        return (input_tokens / 1_000_000) * input_cost + (
            output_tokens / 1_000_000
        ) * output_cost

    @staticmethod
    def estimate_cost_rough(model: str, complexity: str = "medium") -> float:
        """粗略估算（無 token 計數時使用）。

        complexity: "low" | "medium" | "high"
        """
        base_tokens = {"low": 500, "medium": 2000, "high": 8000}
        tokens = base_tokens.get(complexity, 2000)
        return CostTracker.estimate_cost(model, input_tokens=tokens, output_tokens=tokens)


class TierRouter:
    """根據任務重要性與預算壓力選擇模型層級。"""

    def __init__(self, config: BudgetConfig):
        self.config = config

    def resolve_model(
        self,
        tier: BudgetTier,
        budget_pressure: float = 0.0,  # 0.0 ~ 1.0，越高壓力越大
    ) -> str:
        """根據層級與預算壓力解析實際使用的模型名稱。

        budget_pressure >= degrade_threshold 時，使用降級鏈中的便宜模型。
        """
        if budget_pressure >= self.config.degrade_threshold:
            degraded = self.config.degrade_chain.get(tier)
            if degraded:
                logger.info(
                    "預算壓力 %.0f%%，tier %s 降級為 %s",
                    budget_pressure * 100,
                    tier.value,
                    degraded,
                )
                return degraded
        return self.config.tier_models.get(tier, "gpt-4o-mini")

    def select_tier(
        self,
        task_complexity: str,
        is_critical: bool = False,
    ) -> BudgetTier:
        """根據任務特徵選擇層級。"""
        if is_critical:
            return BudgetTier.CRITICAL
        mapping = {
            "high": BudgetTier.REASONING,
            "medium": BudgetTier.ROUTINE,
            "low": BudgetTier.SUMMARY,
        }
        return mapping.get(task_complexity, BudgetTier.ROUTINE)


class BudgetManager:
    """預算管理器：追蹤花費、強制執行上限。"""

    def __init__(self, config: BudgetConfig):
        self.config = config
        self._task_spent: float = 0.0
        self._session_spent: float = 0.0
        self._monthly_spent: float = 0.0
        self._month: int = datetime.now(timezone.utc).month
        self._year: int = datetime.now(timezone.utc).year
        self._router = TierRouter(config)

    # ── 屬性 ──

    @property
    def task_spent(self) -> float:
        return self._task_spent

    @property
    def session_spent(self) -> float:
        return self._session_spent

    @property
    def monthly_spent(self) -> float:
        return self._monthly_spent

    @property
    def budget_pressure(self) -> float:
        """計算當前預算壓力（0.0 ~ 1.0）。"""
        pressures: list[float] = []
        for spent, limit in [
            (self._task_spent, self.config.task_limit_usd),
            (self._session_spent, self.config.session_limit_usd),
            (self._monthly_spent, self.config.monthly_limit_usd),
        ]:
            if limit > 0:
                pressures.append(spent / limit)
        return max(pressures) if pressures else 0.0

    # ── 月度重置 ──

    def _check_month_rollover(self) -> None:
        """檢查是否需要月度重置。"""
        now = datetime.now(timezone.utc)
        if now.month != self._month or now.year != self._year:
            logger.info("月度預算重置：%d-%02d → %d-%02d",
                        self._year, self._month, now.year, now.month)
            self._monthly_spent = 0.0
            self._month = now.month
            self._year = now.year

    # ── 花費記錄 ──

    def record_cost(self, amount: float) -> None:
        """記錄一筆花費到所有追蹤層級。"""
        self._check_month_rollover()
        self._task_spent += amount
        self._session_spent += amount
        self._monthly_spent += amount
        pressure = self.budget_pressure
        if pressure >= self.config.warn_threshold:
            logger.warning(
                "預算警告：已達 %.0f%%（任務 $%.4f/$%.2f，會話 $%.4f/$%.2f，月 $%.4f/$%.2f）",
                pressure * 100,
                self._task_spent, self.config.task_limit_usd,
                self._session_spent, self.config.session_limit_usd,
                self._monthly_spent, self.config.monthly_limit_usd,
            )

    # ── 預算檢查 ──

    def can_afford(self, estimated_cost: float, tier: BudgetTier) -> tuple[bool, str]:
        """檢查是否可負擔預估成本。

        Returns:
            (can_proceed, reason): 是否可繼續，以及原因說明
        """
        self._check_month_rollover()

        # 檢查月度上限
        if (self.config.monthly_limit_usd > 0
                and self._monthly_spent + estimated_cost > self.config.monthly_limit_usd):
            if self.config.hard_stop:
                return False, (
                    f"月度預算已達上限 ($ {self.config.monthly_limit_usd})，"
                    f"已花費 $ {self._monthly_spent:.4f}"
                )
            return True, "月度預算接近上限，已降級到便宜模型"

        # 檢查會話上限
        if (self.config.session_limit_usd > 0
                and self._session_spent + estimated_cost > self.config.session_limit_usd):
            if self.config.hard_stop:
                return False, (
                    f"會話預算已達上限 ($ {self.config.session_limit_usd})，"
                    f"已花費 $ {self._session_spent:.4f}"
                )
            return True, "會話預算接近上限，已降級到便宜模型"

        # 檢查任務上限
        if (self.config.task_limit_usd > 0
                and self._task_spent + estimated_cost > self.config.task_limit_usd):
            if self.config.hard_stop:
                return False, (
                    f"任務預算已達上限 ($ {self.config.task_limit_usd})，"
                    f"已花費 $ {self._task_spent:.4f}"
                )
            return True, "任務預算接近上限，已降級到便宜模型"

        return True, "預算充足"

    def resolve_model_for_tier(self, tier: BudgetTier) -> str:
        """根據當前預算壓力與層級選擇模型。"""
        return self._router.resolve_model(tier, self.budget_pressure)

    # ── 重置 ──

    def reset_task(self) -> None:
        """重置任務級別花費（新任務開始時）。"""
        self._task_spent = 0.0

    def reset_session(self) -> None:
        """重置會話級別花費。"""
        self._session_spent = 0.0
        self._task_spent = 0.0

    # ── 序列化 ──

    def to_dict(self) -> dict:
        """序列化為字典。"""
        return {
            "task_spent": round(self._task_spent, 4),
            "task_limit": self.config.task_limit_usd,
            "session_spent": round(self._session_spent, 4),
            "session_limit": self.config.session_limit_usd,
            "monthly_spent": round(self._monthly_spent, 4),
            "monthly_limit": self.config.monthly_limit_usd,
            "budget_pressure": round(self.budget_pressure, 2),
            "active_tier": self._router.resolve_model(
                BudgetTier.ROUTINE, self.budget_pressure
            ),
        }