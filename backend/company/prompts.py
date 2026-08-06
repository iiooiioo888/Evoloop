"""公司運行時 Prompt 模板。

為每個角色提供專用的系統提示與任務模板，
支援 LLM 驅動的任務分解、執行、審查與整合。

所有提示詞均可透過 PromptConfig 自定義。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# ═══════════════════════════════════════════════════════════════
# Manager：任務分解
# ═══════════════════════════════════════════════════════════════

MANAGER_DECOMPOSE_SYSTEM = (
    "你是一位經驗豐富的專案經理，擅長將複雜目標分解為可獨立執行的子任務。"
    "你需要充分利用團隊的層級結構，最大化並發執行效率。"
    "了解每個角色的專業領域，根據任務類型自動指派最合適的執行者。"
)

MANAGER_DECOMPOSE = """請將以下目標分解為可執行的子工作項，並規劃並發執行策略。

【公司目標】
{goal}

【組織架構與可用角色】
{org_chart}

【角色能力說明】
{role_descriptions}

【預算限制】
任務預算上限：$ {task_budget}
可用模型層級：{active_tier}

【分解原則】
1. 充分發揮團隊層級結構，利用不同角色的專業能力
2. 最大化並發執行：無依賴的工作項應放在同一階段並行
3. 典型的前端頁面開發依賴鏈：
   - Phase 1（並行）：UI Designer 設計線框圖 + Backend Dev 開發 API + Architect 設計架構
   - Phase 2（並行，依賴 Phase 1）：CSS Dev 實作樣式 + JS Dev 實作互動邏輯
   - Phase 3（依賴 Phase 2）：Tester 撰寫測試
   - Phase 4：Tech Lead 審查 → Synthesizer 整合
4. 每個工作項應獨立、可驗證、有明確交付物
5. 標註依賴關係時，注意：depends_on 應指向**必須先完成**的工作項索引
6. 控制在 4-10 個子工作項

只輸出 JSON，不要輸出任何其他文字：
{{
  "execution_plan": "<簡述並發執行策略>",
  "subtasks": [
    {{
      "title": "<工作項標題>",
      "description": "<詳細描述，包含具體交付物要求>",
      "assignee": "{valid_roles}",
      "depends_on": [<依賴的工作項索引，從 0 開始，無依賴則為空陣列>],
      "complexity": "<low/medium/high>",
      "phase": <執行階段編號，從 1 開始>
    }}
  ]
}}"""


# ═══════════════════════════════════════════════════════════════
# Developer：執行工作項
# ═══════════════════════════════════════════════════════════════

DEVELOPER_EXECUTE_SYSTEM = (
    "你是一位專業的開發者，專注於產出高品質的交付物。"
    "你遵循最佳實踐，注重細節，產出可直接使用的成果。"
)

DEVELOPER_EXECUTE = """請執行以下工作項，產出高品質的交付物。

【公司目標】
{goal}

【你的角色】{role_name}

【工作項】
標題：{title}
描述：{description}

【上下文資訊（依賴工作項的交付物）】
{context}

要求：
1. 交付物必須完整、可直接使用
2. 若有不明確之處，請做出合理假設並標註
3. 以結構化格式輸出（markdown 或程式碼）

請直接給出你的交付物："""


# ── 各角色專用執行提示 ──

ROLE_EXECUTE_PROMPTS: dict[str, str] = {
    "ui_designer": (
        "你是一位 UI 設計師。請產出頁面的視覺設計方案，包括：\n"
        "1. 整體佈局結構（header / main / sidebar / footer）\n"
        "2. 關鍵元件的設計描述（按鈕、表單、卡片、導航等）\n"
        "3. 配色方案（主色、輔色、背景色）\n"
        "4. 字體與間距系統\n"
        "5. 響應式斷點規劃\n"
        "以結構化 markdown 輸出，包含具體的 CSS 數值建議。"
    ),
    "css_dev": (
        "你是一位 CSS 開發者。請根據 UI 設計稿產出完整的樣式方案，包括：\n"
        "1. CSS 變數定義（顏色、字體、間距）\n"
        "2. 主要佈局樣式（flexbox/grid）\n"
        "3. 元件樣式（按鈕、表單、卡片等）\n"
        "4. 響應式設計（mobile-first breakpoints）\n"
        "5. 動畫與過渡效果\n"
        "使用 Tailwind CSS 類名或純 CSS 輸出，確保可直接使用。"
    ),
    "js_dev": (
        "你是一位 JavaScript 開發者。請產出前端互動邏輯方案，包括：\n"
        "1. 元件結構與狀態管理方案\n"
        "2. 事件處理邏輯（點擊、提交、驗證）\n"
        "3. API 串接程式碼（fetch/axios）\n"
        "4. 路由配置\n"
        "5. 錯誤處理與載入狀態\n"
        "輸出 React 或 Vue 元件程式碼，確保可直接使用。"
    ),
    "backend_dev": (
        "你是一位後端開發者。請產出 API 實作方案，包括：\n"
        "1. API 端點設計（RESTful，含路徑、方法、參數）\n"
        "2. 資料模型定義（schema/interface）\n"
        "3. 業務邏輯實作（含驗證、錯誤處理）\n"
        "4. 資料庫查詢與操作\n"
        "輸出 Python/FastAPI 或 Node.js/Express 程式碼，確保可直接使用。"
    ),
    "tester": (
        "你是一位測試工程師。請產出測試方案，包括：\n"
        "1. 測試案例清單（含正向/反向/邊界/異常）\n"
        "2. 關鍵測試的實作程式碼\n"
        "3. 測試涵蓋範圍說明\n"
        "4. 預期結果與驗證方式\n"
        "以結構化格式輸出，包含可執行的測試程式碼。"
    ),
    "architect": (
        "你是一位系統架構師。請產出架構設計方案，包括：\n"
        "1. 系統架構圖描述（元件、層級、資料流）\n"
        "2. 技術選型與理由\n"
        "3. 資料庫設計（ER 圖描述）\n"
        "4. API 設計原則\n"
        "5. 非功能性需求考量（效能、安全、擴展）\n"
        "以結構化 markdown 輸出。"
    ),
}


# ═══════════════════════════════════════════════════════════════
# Reviewer：審查交付物
# ═══════════════════════════════════════════════════════════════

REVIEWER_SYSTEM = (
    "你是一位嚴格的審查者，專注於發現交付物中的問題並提供具體改進建議。"
    "你的回饋必須具體、可執行，幫助開發者快速改進。"
)

REVIEWER_REVIEW = """請審查以下交付物，判斷是否通過。

【公司目標】
{goal}

【工作項】
標題：{title}
描述：{description}

【交付物】
{artifact}

請從以下維度評估：
1. 完整性：是否涵蓋所有要求
2. 準確性：內容是否正確
3. 品質：是否達到可交付標準
4. 可用性：是否可直接使用

只輸出 JSON，不要輸出任何其他文字：
{{
  "approved": <true/false>,
  "score": <0-10>,
  "strengths": "<優點>",
  "weaknesses": "<不足>",
  "feedback": "<具體改進建議（若 approved=false 則必填）>"
}}"""


# ═══════════════════════════════════════════════════════════════
# Synthesizer：整合交付物
# ═══════════════════════════════════════════════════════════════

SYNTHESIZER_SYSTEM = (
    "你是一位出色的整合者，擅長將多個交付物合併為一個連貫的整體。"
    "你注重一致性、完整性與可讀性。"
)

SYNTHESIZER_MERGE = """請將以下多個工作項的交付物整合為一個統一的最終產出。

【公司目標】
{goal}

【各工作項交付物】
{artifacts}

【執行統計】
總工作項：{total_items}
完成工作項：{completed_items}
審查輪數：{review_rounds}

要求：
1. 合併所有交付物為一個連貫的整體
2. 解決不同部分之間的矛盾與重複
3. 確保風格與格式一致
4. 加入執行摘要（概述、關鍵決策、建議）

請直接給出整合後的最終產出："""


# ═══════════════════════════════════════════════════════════════
# Manager：最終審查與決策
# ═══════════════════════════════════════════════════════════════

MANAGER_FINAL_REVIEW = """請審查整合後的最終產出，決定是否交付。

【公司目標】
{goal}

【最終產出】
{final_output}

【執行摘要】
- 總工作項：{total_items}
- 審查輪數：{review_rounds}
- 總成本：$ {total_cost}

只輸出 JSON，不要輸出任何其他文字：
{{
  "approved": <true/false>,
  "summary": "<執行摘要>",
  "key_decisions": ["<關鍵決策1>", "<關鍵決策2>"],
  "recommendations": ["<建議1>", "<建議2>"],
  "lessons_learned": "<本次經驗教訓>"
}}"""


# ═══════════════════════════════════════════════════════════════
# 任務拆分模板（供 TEMPLATE 策略使用）
# ═══════════════════════════════════════════════════════════════

PAGE_DEV_TEMPLATE: list[dict[str, Any]] = [
    {
        "title": "UI 設計",
        "description": "設計頁面視覺佈局、線框圖、配色方案、元件設計稿",
        "assignee": "ui_designer",
        "depends_on": [],
        "complexity": "medium",
        "phase": 1,
    },
    {
        "title": "系統架構設計",
        "description": "設計系統架構、技術選型、API 設計原則、資料庫 schema",
        "assignee": "architect",
        "depends_on": [],
        "complexity": "high",
        "phase": 1,
    },
    {
        "title": "後端 API 開發",
        "description": "實作 RESTful API 端點、業務邏輯、資料庫操作、認證授權",
        "assignee": "backend_dev",
        "depends_on": [1],
        "complexity": "high",
        "phase": 1,
    },
    {
        "title": "CSS 樣式開發",
        "description": "根據 UI 設計稿實作樣式（Tailwind CSS），含 RWD 與動畫",
        "assignee": "css_dev",
        "depends_on": [0],
        "complexity": "medium",
        "phase": 2,
    },
    {
        "title": "JS 互動邏輯開發",
        "description": "實作前端互動邏輯、狀態管理、API 串接、路由配置",
        "assignee": "js_dev",
        "depends_on": [0, 2],
        "complexity": "high",
        "phase": 2,
    },
    {
        "title": "測試撰寫",
        "description": "撰寫單元測試、整合測試、E2E 測試，確保覆蓋率",
        "assignee": "tester",
        "depends_on": [3, 4],
        "complexity": "medium",
        "phase": 3,
    },
    {
        "title": "技術審查與整合",
        "description": "審查所有交付物品質，整合為最終產出",
        "assignee": "tech_lead",
        "depends_on": [5],
        "complexity": "medium",
        "phase": 4,
    },
]

GENERIC_DEV_TEMPLATE: list[dict[str, Any]] = [
    {
        "title": "需求分析",
        "description": "分析需求，產出規格文件",
        "assignee": "analyst",
        "depends_on": [],
        "complexity": "medium",
        "phase": 1,
    },
    {
        "title": "實作開發",
        "description": "根據規格實作核心功能",
        "assignee": "developer",
        "depends_on": [0],
        "complexity": "high",
        "phase": 2,
    },
    {
        "title": "測試驗證",
        "description": "測試功能完整性與正確性",
        "assignee": "tester",
        "depends_on": [1],
        "complexity": "medium",
        "phase": 3,
    },
    {
        "title": "審查與整合",
        "description": "審查所有交付物，整合最終產出",
        "assignee": "reviewer",
        "depends_on": [2],
        "complexity": "low",
        "phase": 4,
    },
]

RESEARCH_TEMPLATE: list[dict[str, Any]] = [
    {
        "title": "資料收集",
        "description": "收集相關資料、文獻、數據",
        "assignee": "analyst",
        "depends_on": [],
        "complexity": "medium",
        "phase": 1,
    },
    {
        "title": "分析與撰寫",
        "description": "分析資料，撰寫報告主體",
        "assignee": "analyst",
        "depends_on": [0],
        "complexity": "high",
        "phase": 2,
    },
    {
        "title": "審查與潤飾",
        "description": "審查報告品質，潤飾文字",
        "assignee": "reviewer",
        "depends_on": [1],
        "complexity": "low",
        "phase": 3,
    },
]

TEMPLATE_KEYWORDS: dict[str, list[dict[str, Any]]] = {
    "page": PAGE_DEV_TEMPLATE,
    "頁面": PAGE_DEV_TEMPLATE,
    "ui": PAGE_DEV_TEMPLATE,
    "前端": PAGE_DEV_TEMPLATE,
    "frontend": PAGE_DEV_TEMPLATE,
    "web": PAGE_DEV_TEMPLATE,
    "網頁": PAGE_DEV_TEMPLATE,
    "網站": PAGE_DEV_TEMPLATE,
    "report": RESEARCH_TEMPLATE,
    "報告": RESEARCH_TEMPLATE,
    "research": RESEARCH_TEMPLATE,
    "研究": RESEARCH_TEMPLATE,
    "分析": RESEARCH_TEMPLATE,
    "develop": GENERIC_DEV_TEMPLATE,
    "開發": GENERIC_DEV_TEMPLATE,
    "api": GENERIC_DEV_TEMPLATE,
    "系統": GENERIC_DEV_TEMPLATE,
}


# ═══════════════════════════════════════════════════════════════
# 可自定義提示詞配置
# ═══════════════════════════════════════════════════════════════

@dataclass
class PromptConfig:
    """可完全自定義的提示詞配置。

    所有欄位都有預設值（等於模組級常量），使用者可選擇性覆蓋任一部分。

    使用範例：
        # 使用預設值
        config = PromptConfig()

        # 部分自定義
        config = PromptConfig(
            manager_decompose_system="你是一位敏捷教練...",
            developer_execute="請以 TDD 方式執行...",
        )

        # 透過 CompanyConfig 注入
        company = CompanyConfig(
            prompt_config=PromptConfig(manager_decompose="..."),
        )
    """

    # ── Manager：任務分解 ──
    manager_decompose_system: str = MANAGER_DECOMPOSE_SYSTEM
    manager_decompose: str = MANAGER_DECOMPOSE
    manager_final_review: str = MANAGER_FINAL_REVIEW

    # ── Developer：執行工作項 ──
    developer_execute_system: str = DEVELOPER_EXECUTE_SYSTEM
    developer_execute: str = DEVELOPER_EXECUTE
    role_execute_prompts: dict[str, str] = field(
        default_factory=lambda: dict(ROLE_EXECUTE_PROMPTS)
    )

    # ── Reviewer：審查交付物 ──
    reviewer_system: str = REVIEWER_SYSTEM
    reviewer_review: str = REVIEWER_REVIEW

    # ── Synthesizer：整合交付物 ──
    synthesizer_system: str = SYNTHESIZER_SYSTEM
    synthesizer_merge: str = SYNTHESIZER_MERGE

    # ── 任務拆分模板 ──
    decompose_templates: dict[str, list[dict[str, Any]]] = field(
        default_factory=lambda: {
            "page_dev": list(PAGE_DEV_TEMPLATE),
            "generic_dev": list(GENERIC_DEV_TEMPLATE),
            "research": list(RESEARCH_TEMPLATE),
        }
    )
    template_keywords: dict[str, list[dict[str, Any]]] = field(
        default_factory=lambda: dict(TEMPLATE_KEYWORDS)
    )