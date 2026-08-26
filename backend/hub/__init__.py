"""AI Hub 多模型編排層（Contract-First，對齊 docs/AI_HUB_DETAILED_DESIGN.md）。

本套件為 EvoLoop 旁路服務：路徑前綴 /api/v1，不取代 /chat 與 /tasks，
不修改 evoloop_graph。所有 LLM 呼叫必須經 backend.core.llm.call_llm。
"""

from backend.hub.catalog import (
    CN_SET,
    DEFAULT_CHAIN,
    HUB_CATALOG,
    INTEL,
    PROVIDER_OF,
)

__all__ = [
    "CN_SET",
    "DEFAULT_CHAIN",
    "HUB_CATALOG",
    "INTEL",
    "PROVIDER_OF",
]
