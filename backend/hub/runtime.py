"""Hub 執行期單例：store / cache / budget / circuit。測試可 reset。"""

from __future__ import annotations

from backend.hub.budget_guard import DailyBudgetLedger
from backend.hub.cache import SemanticCache
from backend.hub.circuit import CircuitRegistry
from backend.hub.store import HubStore


class HubRuntime:
    def __init__(self) -> None:
        self.store = HubStore()
        self.cache = SemanticCache()
        self.budget = DailyBudgetLedger()
        self.circuits = CircuitRegistry()
        self.upstream_calls: list[dict] = []

    def reset(self) -> None:
        self.store.reset()
        self.cache.reset()
        self.budget.reset()
        self.circuits.reset()
        self.upstream_calls.clear()


runtime = HubRuntime()


def reset_runtime() -> None:
    runtime.reset()
