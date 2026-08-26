"""Hub 日預算攔截。與 backend.company.budget.BudgetManager 計數器完全隔離。"""

from __future__ import annotations

from datetime import datetime, timezone

from backend.hub.catalog import PRICE_PER_1M

BUFFER = 1.2


def estimate_cost_usd(
    model: str,
    input_tokens: int,
    expected_output_tokens: int,
    buffer: float = BUFFER,
) -> float:
    """預估費用 = ((in * in_price) + (out * out_price)) / 1M * 1.2。"""
    prices = PRICE_PER_1M.get(model)
    if prices is None:
        prices = (1.0, 4.0)
    in_p, out_p = prices
    raw = (input_tokens / 1_000_000) * in_p + (expected_output_tokens / 1_000_000) * out_p
    return raw * buffer


def actual_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    prices = PRICE_PER_1M.get(model, (1.0, 4.0))
    in_p, out_p = prices
    return (input_tokens / 1_000_000) * in_p + (output_tokens / 1_000_000) * out_p


def estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


def utc_yyyymmdd(now: datetime | None = None) -> str:
    ts = now or datetime.now(timezone.utc)
    return ts.strftime("%Y%m%d")


class DailyBudgetLedger:
    """對應 Redis `budget:daily:{uid}:{yyyymmdd}`。"""

    def __init__(self) -> None:
        self._spent: dict[str, float] = {}

    def _key(self, user_id: str, day: str | None = None) -> str:
        return f"budget:daily:{user_id}:{day or utc_yyyymmdd()}"

    def spent_today(self, user_id: str) -> float:
        return self._spent.get(self._key(user_id), 0.0)

    def would_exceed(self, user_id: str, estimate: float, daily_limit: float) -> bool:
        return self.spent_today(user_id) + estimate > daily_limit

    def add(self, user_id: str, cost: float) -> None:
        key = self._key(user_id)
        self._spent[key] = self._spent.get(key, 0.0) + cost

    def set_spent(self, user_id: str, amount: float) -> None:
        self._spent[self._key(user_id)] = amount

    def reset(self) -> None:
        self._spent.clear()
