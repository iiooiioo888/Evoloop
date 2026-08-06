"""EvoLoop 核心狀態模型（Task 1.1）。

定義流轉於整個反思迴圈的狀態結構，每個 LangGraph 節點
接收此狀態並回傳需要更新的部份欄位。
"""

from typing import Any

from typing_extensions import TypedDict

from opc_service.state import OPCStateFields


class ReflectionRecord(TypedDict):
    """單次反思迴圈的紀錄。"""

    iteration: int
    score: float
    critique: str
    suggestion: str


class EvoLoopState(OPCStateFields, total=False):
    """EvoLoop 反思迴圈的完整狀態。

    繼承 OPCStateFields 以包含 OPC 相關狀態欄位。
    total=False 使所有欄位皆為選填，LangGraph 節點只需
    回傳自己更新的欄位，框架會自動合併進狀態。
    """

    # ---- 輸入 ----
    query: str
    history: list[dict[str, str]]
    session_id: str

    # ---- 記憶檢索（Phase 2 啟用向量檢索後注入） ----
    retrieved_memories: list[str]

    # ---- 生成 ----
    initial_answer: str
    current_answer: str

    # ---- 評估 ----
    score: float
    evaluation: dict[str, Any]

    # ---- 反思 ----
    critique: str
    suggestion: str
    reflections: list[ReflectionRecord]
    iteration: int
    max_iterations: int

    # ---- 輸出 ----
    final_answer: str
    memory_saved: bool

    # ---- 文本化存檔（Task 8.6） ----
    archived: bool
    archive_metadata: dict[str, Any]

    # ---- 公司運行時（Phase 6+ 多代理人） ----
    company_mode: bool
    company_template: str
    company_result: dict[str, Any]
    company_kanban: dict[str, Any]
    company_budget: dict[str, Any]