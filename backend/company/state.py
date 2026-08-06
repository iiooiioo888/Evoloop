"""公司運行時狀態模型。

定義公司配置、角色、工作項、預算追蹤等核心資料結構。
所有模型均為 dataclass，方便序列化與測試隔離。
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from backend.company.prompts import PromptConfig

# ═══════════════════════════════════════════════════════════════
# 工作項狀態機
# ═══════════════════════════════════════════════════════════════

class WorkItemStatus(str, Enum):
    """工作項生命週期狀態。

    流轉路徑：
      PLANNING → READY → EXECUTING → IN_REVIEW
        → REWORK → EXECUTING（迴圈）
        → DONE
        → BLOCKED（可由任何狀態轉入，解除後回到原狀態）
    """

    PLANNING = "planning"        # 規劃中：Manager 正在拆解/定義
    READY = "ready"              # 就緒：可被領取執行
    EXECUTING = "executing"      # 執行中：Worker 正在處理
    IN_REVIEW = "in_review"      # 審查中：Reviewer 正在評估
    REWORK = "rework"            # 需修改：審查不通過，退回重做
    DONE = "done"                # 已完成
    BLOCKED = "blocked"          # 阻塞：等待外部依賴或決策


# 合法的狀態轉換
VALID_TRANSITIONS: dict[WorkItemStatus, set[WorkItemStatus]] = {
    WorkItemStatus.PLANNING:   {WorkItemStatus.READY, WorkItemStatus.BLOCKED},
    WorkItemStatus.READY:      {WorkItemStatus.EXECUTING, WorkItemStatus.BLOCKED},
    WorkItemStatus.EXECUTING:  {WorkItemStatus.IN_REVIEW, WorkItemStatus.BLOCKED},
    WorkItemStatus.IN_REVIEW:  {WorkItemStatus.DONE, WorkItemStatus.REWORK, WorkItemStatus.BLOCKED},
    WorkItemStatus.REWORK:     {WorkItemStatus.EXECUTING, WorkItemStatus.BLOCKED},
    WorkItemStatus.DONE:       set(),  # 終態
    WorkItemStatus.BLOCKED:    {WorkItemStatus.READY, WorkItemStatus.EXECUTING,
                                WorkItemStatus.IN_REVIEW, WorkItemStatus.REWORK},
}


# ═══════════════════════════════════════════════════════════════
# 預算層級
# ═══════════════════════════════════════════════════════════════

class BudgetTier(str, Enum):
    """模型路由層級，決定使用哪個模型處理任務。

    - critical:  關鍵決策、複雜程式碼生成（最貴模型）
    - reasoning: 多步驟規劃、邏輯推理
    - routine:   日常對話、簡單任務
    - summary:   摘要、分類（最便宜模型）
    """

    CRITICAL = "critical"
    REASONING = "reasoning"
    ROUTINE = "routine"
    SUMMARY = "summary"


# ═══════════════════════════════════════════════════════════════
# 工作項優先級
# ═══════════════════════════════════════════════════════════════

class Priority(int, Enum):
    """工作項優先級。數值越小優先級越高。"""

    CRITICAL = 0   # 關鍵路徑，必須最先完成
    HIGH = 1       # 高優先級
    MEDIUM = 2     # 中優先級（預設）
    LOW = 3        # 低優先級，可延後


# ═══════════════════════════════════════════════════════════════
# 角色定義
# ═══════════════════════════════════════════════════════════════

class RoleType(str, Enum):
    """預定義角色類型，含層級關係。

    層級結構（從上到下）：
      Level 0: MANAGER (CEO/PM)
      Level 1: TECH_LEAD, ARCHITECT
      Level 2: FRONTEND_LEAD, BACKEND_LEAD, TEST_LEAD
      Level 3: UI_DESIGNER, CSS_DEV, JS_DEV, BACKEND_DEV, TESTER, DEVOPS
      Level 4: REVIEWER, SYNTHESIZER, ANALYST, COORDINATOR (支援角色)
    """

    # ── Level 0：最高決策層 ──
    MANAGER = "manager"

    # ── Level 1：技術領導層 ──
    TECH_LEAD = "tech_lead"          # 技術主管：技術方向、架構決策、程式碼審查
    ARCHITECT = "architect"          # 架構師：系統設計、技術選型

    # ── Level 2：領域領導層 ──
    FRONTEND_LEAD = "frontend_lead"  # 前端主管：UI/UX 方向、前端架構
    BACKEND_LEAD = "backend_lead"    # 後端主管：API 設計、資料庫架構
    TEST_LEAD = "test_lead"          # 測試主管：測試策略、品質標準

    # ── Level 3：執行層 ──
    UI_DESIGNER = "ui_designer"      # UI 設計師：視覺設計、線框圖、原型
    CSS_DEV = "css_dev"              # CSS 開發者：樣式、響應式、動畫
    JS_DEV = "js_dev"                # JS 開發者：前端邏輯、互動、狀態管理
    BACKEND_DEV = "backend_dev"      # 後端開發者：API、業務邏輯、資料庫
    TESTER = "tester"                # 測試工程師：測試案例、自動化測試、QA
    DEVOPS = "devops"                # 維運工程師：部署、CI/CD、監控

    # ── Level 4：支援角色 ──
    DEVELOPER = "developer"          # 通用開發者（向後相容）
    REVIEWER = "reviewer"            # 審查者
    SYNTHESIZER = "synthesizer"      # 整合者
    ANALYST = "analyst"              # 分析師
    COORDINATOR = "coordinator"      # 協調者


class RoleCategory(str, Enum):
    """角色分類：用於任務分解時的自動指派邏輯。"""

    UI = "ui"                  # UI 設計類
    CSS = "css"                # 樣式類
    JS = "js"                  # 前端邏輯類
    BACKEND = "backend"        # 後端類
    TEST = "test"              # 測試類
    DEVOPS = "devops"          # 維運類
    MANAGEMENT = "management"  # 管理類
    REVIEW = "review"          # 審查類


# 角色到分類的映射（供自動指派使用）
ROLE_CATEGORY_MAP: dict[RoleType, RoleCategory] = {
    RoleType.UI_DESIGNER: RoleCategory.UI,
    RoleType.CSS_DEV: RoleCategory.CSS,
    RoleType.JS_DEV: RoleCategory.JS,
    RoleType.FRONTEND_LEAD: RoleCategory.JS,
    RoleType.BACKEND_DEV: RoleCategory.BACKEND,
    RoleType.BACKEND_LEAD: RoleCategory.BACKEND,
    RoleType.TESTER: RoleCategory.TEST,
    RoleType.TEST_LEAD: RoleCategory.TEST,
    RoleType.DEVOPS: RoleCategory.DEVOPS,
    RoleType.MANAGER: RoleCategory.MANAGEMENT,
    RoleType.TECH_LEAD: RoleCategory.MANAGEMENT,
    RoleType.ARCHITECT: RoleCategory.MANAGEMENT,
    RoleType.REVIEWER: RoleCategory.REVIEW,
}


# 角色層級（數字越小越高層）
ROLE_LEVEL: dict[RoleType, int] = {
    RoleType.MANAGER: 0,
    RoleType.TECH_LEAD: 1,
    RoleType.ARCHITECT: 1,
    RoleType.FRONTEND_LEAD: 2,
    RoleType.BACKEND_LEAD: 2,
    RoleType.TEST_LEAD: 2,
    RoleType.UI_DESIGNER: 3,
    RoleType.CSS_DEV: 3,
    RoleType.JS_DEV: 3,
    RoleType.BACKEND_DEV: 3,
    RoleType.TESTER: 3,
    RoleType.DEVOPS: 3,
    RoleType.DEVELOPER: 3,
    RoleType.REVIEWER: 4,
    RoleType.SYNTHESIZER: 4,
    RoleType.ANALYST: 4,
    RoleType.COORDINATOR: 4,
}


@dataclass
class RoleDefinition:
    """角色定義：職責、能力、層級關係、可委派對象。"""

    role_type: RoleType
    name: str                                    # 角色名稱（如 "前端主管"）
    responsibilities: list[str] = field(default_factory=list)
    can_delegate_to: list[RoleType] = field(default_factory=list)
    reporting_to: RoleType | None = None          # 匯報對象（上級角色）
    default_tier: BudgetTier = BudgetTier.ROUTINE
    max_parallel_work: int = 3
    system_prompt: str = ""
    level: int = 3                                # 角色層級（0=最高）

    def is_superior_to(self, other: RoleType) -> bool:
        """判斷是否為 other 的上級。"""
        return other in self.can_delegate_to

    def can_manage(self, other: RoleType) -> bool:
        """判斷是否可管理 other（直接或間接）。"""
        return other in self.can_delegate_to


# ═══════════════════════════════════════════════════════════════
# 工作項
# ═══════════════════════════════════════════════════════════════

@dataclass
class WorkItem:
    """單一工作項：可被指派、執行、審查的任務單元。"""

    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    title: str = ""
    description: str = ""
    status: WorkItemStatus = WorkItemStatus.PLANNING
    assignee: RoleType | None = None             # 負責角色
    created_by: RoleType | None = None            # 創建者
    depends_on: list[str] = field(default_factory=list)  # 依賴的工作項 ID
    artifacts: dict[str, Any] = field(default_factory=dict)  # 產出物
    feedback: list[dict[str, Any]] = field(default_factory=list)  # 審查回饋
    tier: BudgetTier = BudgetTier.ROUTINE         # 所需模型層級
    priority: Priority = Priority.MEDIUM            # 優先級
    estimated_cost: float = 0.0                   # 預估成本
    actual_cost: float = 0.0                      # 實際成本
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: str | None = None

    def transition_to(self, new_status: WorkItemStatus) -> bool:
        """嘗試狀態轉換，回傳是否成功。"""
        if new_status in VALID_TRANSITIONS.get(self.status, set()):
            self.status = new_status
            self.updated_at = datetime.now(timezone.utc).isoformat()
            if new_status == WorkItemStatus.DONE:
                self.completed_at = datetime.now(timezone.utc).isoformat()
            return True
        return False


# ═══════════════════════════════════════════════════════════════
# 預算設定
# ═══════════════════════════════════════════════════════════════

@dataclass
class RetryConfig:
    """錯誤重試與升級配置。"""

    max_retries: int = 3                    # 最大重試次數
    retry_backoff_base: float = 1.0         # 退避基礎秒數（指數增長）
    enable_escalation: bool = True          # 是否啟用角色升級
    deadline_seconds: float = 300.0         # 單一工作項超時秒數（0=不限）


@dataclass
class BudgetConfig:
    """預算配置：每任務/每會話/每月上限與降級策略。"""

    task_limit_usd: float = 2.0        # 每任務上限（0=不限）
    session_limit_usd: float = 10.0    # 每會話上限
    monthly_limit_usd: float = 100.0   # 每月上限
    warn_threshold: float = 0.8        # 80% 時警告
    degrade_threshold: float = 0.9     # 90% 時降級到便宜模型
    hard_stop: bool = False            # True=超限停止，False=降級繼續

    # 層級路由：每個 tier 對應的模型名稱
    tier_models: dict[BudgetTier, str] = field(default_factory=lambda: {
        BudgetTier.CRITICAL: "gpt-4o",
        BudgetTier.REASONING: "gpt-4o",
        BudgetTier.ROUTINE: "gpt-4o-mini",
        BudgetTier.SUMMARY: "gpt-4o-mini",
    })

    # 降級鏈：預算壓力下每個 tier 的備用模型
    degrade_chain: dict[BudgetTier, str] = field(default_factory=lambda: {
        BudgetTier.CRITICAL: "gpt-4o-mini",
        BudgetTier.REASONING: "gpt-4o-mini",
    })


# ═══════════════════════════════════════════════════════════════
# 公司配置
# ═══════════════════════════════════════════════════════════════

@dataclass
class CompanyConfig:
    """公司配置：組織架構、角色、層級樹、預算、執行策略。"""

    name: str = "EvoLoop 公司"
    description: str = ""
    roles: dict[RoleType, RoleDefinition] = field(default_factory=dict)
    budget: BudgetConfig = field(default_factory=BudgetConfig)

    # 層級關係
    org_chart: dict[RoleType, list[RoleType]] = field(default_factory=dict)
    # org_chart[MANAGER] = [TECH_LEAD, ARCHITECT]
    # org_chart[TECH_LEAD] = [FRONTEND_LEAD, BACKEND_LEAD, TEST_LEAD]

    # 執行策略
    max_parallel_workers: int = 4
    max_review_rounds: int = 3
    auto_approve_risk: str = "medium"

    # 提示詞配置（可完全自定義）
    prompt_config: PromptConfig = field(default_factory=PromptConfig)

    # 重試與錯誤處理配置
    retry_config: RetryConfig = field(default_factory=RetryConfig)

    # 任務分解策略
    decompose_strategy: str = "auto"  # auto | hierarchical | flat
    enable_parallel_decompose: bool = True  # 是否允許 LLM 規劃並發執行

    def get_subordinates(self, role: RoleType) -> list[RoleType]:
        """取得某角色的直屬下級。"""
        return self.org_chart.get(role, [])

    def get_all_subordinates(self, role: RoleType) -> list[RoleType]:
        """遞迴取得所有下級（含間接）。"""
        result = []
        direct = self.org_chart.get(role, [])
        for sub in direct:
            result.append(sub)
            result.extend(self.get_all_subordinates(sub))
        return result

    def get_superior(self, role: RoleType) -> RoleType | None:
        """取得某角色的直屬上級。"""
        for superior, subs in self.org_chart.items():
            if role in subs:
                return superior
        return None

    def get_role_level(self, role: RoleType) -> int:
        """取得角色層級。"""
        return ROLE_LEVEL.get(role, 3)

    def build_org_tree(self) -> dict:
        """構建組織樹（供視覺化）。"""
        def _build(node: RoleType) -> dict:
            role_def = self.roles.get(node)
            return {
                "role": node.value,
                "name": role_def.name if role_def else node.value,
                "level": self.get_role_level(node),
                "children": [
                    _build(child)
                    for child in self.org_chart.get(node, [])
                ],
            }
        # 找根節點（Level 0）
        roots = [r for r in self.roles if self.get_role_level(r) == 0]
        if not roots:
            roots = [next(iter(self.roles))] if self.roles else []
        return {
            "company": self.name,
            "tree": [_build(root) for root in roots],
        }


# ═══════════════════════════════════════════════════════════════
# 公司運行時狀態
# ═══════════════════════════════════════════════════════════════

@dataclass
class CompanyRunState:
    """公司單次運行的即時狀態。"""

    config: CompanyConfig = field(default_factory=CompanyConfig)
    goal: str = ""                                  # 公司目標
    work_items: dict[str, WorkItem] = field(default_factory=dict)
    run_log: list[dict[str, Any]] = field(default_factory=list)

    # 預算追蹤
    task_spent: float = 0.0
    session_spent: float = 0.0
    monthly_spent: float = 0.0
    active_tier: BudgetTier = BudgetTier.ROUTINE

    # 執行統計
    total_items: int = 0
    completed_items: int = 0
    review_rounds: int = 0

    def get_kanban(self) -> dict[WorkItemStatus, list[WorkItem]]:
        """回傳當前看板狀態。"""
        board: dict[WorkItemStatus, list[WorkItem]] = {
            s: [] for s in WorkItemStatus
        }
        for item in self.work_items.values():
            board[item.status].append(item)
        return board

    def get_ready_items(self) -> list[WorkItem]:
        """取得所有就緒可執行的工作項（依賴已滿足）。"""
        done_ids = {
            wid for wid, item in self.work_items.items()
            if item.status == WorkItemStatus.DONE
        }
        ready = []
        for item in self.work_items.values():
            if item.status != WorkItemStatus.READY:
                continue
            if all(dep in done_ids for dep in item.depends_on):
                ready.append(item)
        return ready

    def to_dict(self) -> dict[str, Any]:
        """序列化為字典（供存檔/API 回應）。"""
        return {
            "goal": self.goal,
            "work_items": {
                wid: {
                    "id": item.id,
                    "title": item.title,
                    "status": item.status.value,
                    "assignee": item.assignee.value if item.assignee else None,
                    "depends_on": item.depends_on,
                    "tier": item.tier.value,
                    "actual_cost": item.actual_cost,
                    "created_at": item.created_at,
                    "completed_at": item.completed_at,
                }
                for wid, item in self.work_items.items()
            },
            "budget": {
                "task_spent": round(self.task_spent, 4),
                "task_limit": self.config.budget.task_limit_usd,
                "session_spent": round(self.session_spent, 4),
                "session_limit": self.config.budget.session_limit_usd,
                "monthly_spent": round(self.monthly_spent, 4),
                "monthly_limit": self.config.budget.monthly_limit_usd,
                "active_tier": self.active_tier.value,
            },
            "progress": {
                "total": self.total_items,
                "completed": self.completed_items,
                "review_rounds": self.review_rounds,
            },
        }