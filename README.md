# EvoLoop

EvoLoop 是一個具備「自我反思閉環」的 AI 助手系統，並擴展為多代理人公司運行時。它不只是單次回答使用者問題，而是透過 **生成 → 評估 → 反思 → 優化** 的迴圈持續改進回答品質，並將成功經驗存入向量記憶庫（ChromaDB），作為後續回答的 few-shot 提示。在面對複雜目標時，系統可切換至**公司模式**，由 Manager 分解任務、多角色分工平行執行、Reviewer 審查把關、Synthesizer 整合交付——公司產出同樣進入評估/反思/改進的迭代迴圈，確保最終交付品質達標。全程內建預算感知與模型層級路由。此外，透過 OPC UA 整合可接入工業感測與控制數據，實現「感知 → 診斷 → 行動」的工業閉環。

## 核心架構

### 反思迭代迴圈（標準模式 + 公司模式共用）

```
使用者查詢
   |
   v
[retrieve_memories]         從向量記憶庫檢索相似經驗（few-shot）
   |
   v
[route_to_company] ──公司模式──> [run_company] ──> [should_evaluate_company]
   |                                      |
   標準模式                    成功 ──┐     └── 失敗 ──> [archive_state] ──> END
   v                                      v
[generate_initial_answer]          [evaluate_answer]  自動評分（0-10）
   |                                      |
   v                                      v
[evaluate_answer]          [should_improve]
   |                                      |
   v                                      |-- 評分 < 8 且未達最大迭代 --> [reflect] --> [improve_answer] --> 重新評估（迴圈）
[should_improve]              |
   |                          +-- 評分 >= 8 或達上限 --> [decide_final_answer] --> [save_memory] --> [archive_state] --> END
   |-- 評分 < 8 ... --> [reflect] → [improve_answer] → 重新評估（迴圈）
   |
   +-- 評分 >= 8 ... --> [decide_final_answer] → [save_memory] → [archive_state] → END
```

> **公司模式迭代**：`run_company` 執行完整公司流程（分解→執行→審查→整合→最終審查）後，
> 產出設為 `current_answer` 並進入與標準模式相同的 `evaluate_answer → reflect → improve_answer`
> 迭代迴圈。若公司執行失敗，則跳過迭代直接存檔。

### 多代理人公司模式（內部流程）

```
使用者目標
   |
   v
[Manager 分解] ── 產出工作項（含依賴 DAG）
   |
   v
[平行執行] ── Developer 角色依依賴順序並發處理
   |         （無依賴的工作項同時執行，有依賴的等待上游完成）
   v
[Reviewer 審查] ── 通過 → DONE ／ 不通過 → REWORK → 重新執行（最多 N 輪）
   |
   v
[Synthesizer 整合] ── 合併所有工作項交付物為統一產出
   |
   v
[Manager 最終審查] ── 產出最終交付物 + 看板 + 預算報告
   |
   v
（公司產出進入上方反思迭代迴圈，由外部 evaluate_answer 評估與改進）
```

### OPC 工業閉環

```
[sense_opc]  讀取 OPC UA 感測器數據
   |
   v
[diagnose_opc]  LLM 分析數據，診斷異常
   |
   v
[act_opc]  根據診斷結果執行控制動作（寫入 OPC 標籤，經安全護欄檢查）
```

## 專案結構

```
evoloop/
├── backend/                # FastAPI 後端 + LangGraph 核心閉環
│   ├── main.py             #   FastAPI 應用入口（/chat, /health）
│   ├── Dockerfile          #   容器化構建檔
│   ├── core/               #   狀態模型、節點、圖定義
│   │   ├── graph.py        #     反思迴圈圖（含公司模式路由）
│   │   ├── nodes.py        #     標準模式節點（生成/評估/反思/改進/存檔）
│   │   ├── company_nodes.py#     公司模式節點（路由/執行/結果收集）
│   │   ├── opc_nodes.py    #     OPC 整合節點（感知/診斷/行動）
│   │   ├── llm.py          #     LiteLLM 統一呼叫層
│   │   └── state.py        #     EvoLoopState 定義
│   ├── company/            #   多代理人公司運行時（Phase 6+）
│   │   ├── orchestrator.py #     公司協調器（分解→執行→審查→整合→最終審查）
│   │   ├── decomposer.py   #     任務拆分器（LLM/模板/規則三策略，獨立主模組）
│   │   ├── roles.py        #     預定義角色設定檔與組織模板
│   │   ├── work_item.py    #     工作項管理（狀態機 + 依賴 DAG + 優先級排序）
│   │   ├── budget.py       #     預算控制 + 模型層級路由 + 成本追蹤
│   │   ├── state.py        #     公司/角色/工作項/預算/重試/優先級資料結構
│   │   ├── events.py       #     生命週期事件系統（EventBus + CompanyEvent）
│   │   └── prompts.py      #     各角色 Prompt 模板（PromptConfig 可自定義）
│   ├── prompts/            #   標準模式 Prompt 模板
│   ├── memory/             #   記憶儲存
│   │   ├── vector_store.py #     ChromaDB 向量記憶庫（Phase 2）
│   │   └── json_store.py   #     JSON 暫存（Phase 1 遺留）
│   ├── services/           #   營運服務
│   │   └── archiver.py     #     文本化存檔（Task 8.6，JSONL）
│   ├── scripts/            #   工具腳本
│   │   ├── test_llm_connection.py  # LLM 連線測試
│   │   └── smoke_test.py           # 向量記憶庫冒煙測試
│   └── tests/              #   單元 / 整合測試
├── opc_service/            # OPC UA 工業數據微服務（Phase 7）
│   ├── Dockerfile          #   容器化構建檔
│   ├── main.py             #   FastAPI 應用入口
│   ├── routes.py           #   REST + WebSocket API 路由
│   ├── opc_client.py       #   asyncua OPC UA 客戶端封裝
│   ├── guard.py            #   安全護欄（白名單/邊界檢查/審計日誌）
│   ├── simulator.py        #   模擬 OPC UA 伺服器（開發測試用）
│   ├── models.py           #   Pydantic 請求/回應模型
│   └── config.py           #   環境設定
├── frontend/               # React + Vite + TypeScript 對話介面（待實作）
├── dspy_pipeline/          # DSPy 自動提示優化（待實作）
├── docker/                 # 容器化設定（待完善）
├── docker-compose.yml      # 四服務編排（backend/opc/redis/chroma；frontend 待實作後啟用）
├── requirements.txt        # Python 依賴
└── .env.example            # 環境變數範本
```

## 關鍵特性

### 反思閉環
- 自動評分（0-10 分），低於門檻（預設 8）自動進入反思迴圈
- 最大迭代次數可配置（預設 3 輪），避免無限循環
- 成功經驗存入向量記憶庫，供後續查詢做 few-shot 參考

### 多代理人公司運行時
- **層級角色體系**（Level 0-4）：Manager → Tech Lead / Architect → 領域主管 → 執行者（UI/CSS/JS/Backend/Tester/DevOps）→ 支援角色（Reviewer/Synthesizer/Analyst/Coordinator）
- **五種內建組織模板**：`page_dev`（頁面開發）、`fullstack_app`（全端開發）、`research_report`（研究報告）、`quick_task`（快速任務）、`full_company`（完整公司）
- **任務拆分器**（TaskDecomposer，獨立主模組）：支援 LLM 驅動、模板驅動、規則驅動三種策略，可根據預算壓力自動降級
- **工作項狀態機**（7 狀態）：Planning → Ready → Executing → In Review → Rework ↺ / Done / Blocked
- **優先級調度**：四級優先級（Critical/High/Medium/Low），就緒工作項按優先級排序執行
- **並行工作池**：Semaphore 限制最大並行數（預設 4），避免資源耗盡
- **依賴 DAG 平行執行**：無依賴的工作項並發處理，有依賴的等待上游完成
- **審查閘**：每個工作項執行完畢後由 Reviewer 審查，不通過則退回修改（最多 N 輪）
- **看板管理**：即時查看各狀態工作項分佈與進度

### 事件系統與錯誤處理
- **生命週期事件**（13 種 CompanyEvent）：涵蓋公司啟動/完成、階段切換、工作項執行/重試/升級、審查通過/退回、預算警告/降級
- **非阻塞事件匯流排**（EventBus）：監聽器異常不中斷主流程，支援動態註冊/移除
- **重試與角色升級**（RetryConfig）：LLM 失敗時指數退避重試，耗盡後自動升級到上級角色處理
- **超時控制**：可為單一工作項設定 deadline，超時自動觸發重試

### 檢查點與狀態恢復
- **序列化檢查點**（`to_checkpoint`）：將完整運行狀態（工作項、預算、日誌）序列化為字典，供中斷後恢復
- **反序列化恢復**（`from_checkpoint`）：從檢查點重建 Orchestrator，恢復所有工作項狀態與預算
- **可注入提示詞配置**（PromptConfig）：所有角色 Prompt 皆可透過 CompanyConfig / TaskDecomposer / Orchestrator 構造函數自定義，支援部分覆蓋

### 預算感知模型路由
- **四級模型層級**：`critical`（關鍵決策）→ `reasoning`（多步推理）→ `routine`（常規任務）→ `summary`（摘要生成）
- **三級預算控制**：任務級 / 會話級 / 月度級，超支自動降級至更便宜的模型
- **成本追蹤**：基於 token 計價估算每次 LLM 呼叫成本，全程透明

### OPC UA 工業整合
- **REST + WebSocket API**：讀取/寫入/瀏覽 OPC 標籤，支援即時訂閱
- **安全護欄**：寫入白名單、數值邊界檢查、完整審計日誌
- **模擬伺服器**：內建模擬 OPC UA 環境（溫度/壓力/流量/閥門/馬達），無需真實設備即可開發測試
- **EvoLoop 整合節點**：`sense_opc`（讀取感測器）→ `diagnose_opc`（LLM 診斷）→ `act_opc`（執行控制）

### 文本化存檔
- 每次對話完整生命週期結構化保存為 JSONL（以 UTC 日期分割檔案）
- 非同步寫入（aiofiles），不阻塞主回應流程
- 供審計、除錯、訓練資料回溯與系統行為分析

## 快速開始

### 環境需求

- Python 3.10–3.12
- （選用）Redis 7+、ChromaDB — 亦可透過 Docker Compose 啟動

### 安裝與設定

```powershell
# 1. 建立虛擬環境
python -m venv .venv
.venv\Scripts\Activate.ps1

# 2. 安裝依賴
pip install -r requirements.txt

# 3. 設定環境變數
copy .env.example .env   # 填入你的 OPENAI_API_KEY

# 4. 測試 LLM 連線
python backend/scripts/test_llm_connection.py

# 5. 冒煙測試（向量記憶庫核心功能）
python -m backend.scripts.smoke_test

# 6. 執行測試
pytest backend/tests/
```

### 啟動 OPC 微服務

```powershell
# 僅啟動 API（連接外部 OPC 伺服器）
python -m opc_service.main

# 同時啟動模擬 OPC 伺服器 + API（開發測試用）
$env:OPC_SIM_ENABLED="true"; python -m opc_service.main

# 使用 uvicorn（含熱重載）
uvicorn opc_service.main:app --host 0.0.0.0 --port 8001 --reload
```

### Docker Compose 部署

> **注意**：Docker 容器內服務間透過服務名通訊，請在 `.env` 中將主機名調整為服務名：
> `REDIS_URL=redis://redis:6379/0`、`CHROMA_HOST=chroma`、`OPC_SERVICE_URL=http://opc_service:8001`。

```powershell
# 啟動全部可用服務（backend / opc_service / redis / chroma）
docker compose up -d

# 僅啟動基礎設施（redis + chroma）
docker compose up -d redis chroma

# 單獨構建並啟動 backend
docker compose up -d --build backend
```

| 服務 | 連接埠 | Dockerfile | 說明 |
| --- | --- | --- | --- |
| backend | 8000 | `backend/Dockerfile` | FastAPI 後端 + LangGraph 核心閉環 |
| opc_service | 8001 | `opc_service/Dockerfile` | OPC UA 工業數據微服務 |
| redis | 6379 | 官方映像 | 會話快取 |
| chroma | 8100 | 官方映像 | 向量資料庫 |

> `frontend` 服務（連接埠 5173）目前為待實作狀態，已在 `docker-compose.yml` 中註解，前端完成後取消註解即可啟用。

## 環境變數

| 變數 | 預設值 | 說明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | **必填**，LLM 服務金鑰 |
| `EVOL_MODEL` | `gpt-4o` | LiteLLM 模型名稱（可換 claude/gemini 等） |
| `EVOL_PASS_THRESHOLD` | `8` | 反思迴圈評分門檻 |
| `EVOL_MAX_ITERATIONS` | `3` | 反思迴圈最大迭代次數 |
| `BACKEND_HOST` / `BACKEND_PORT` | `0.0.0.0` / `8000` | 後端服務綁定 |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis 連線位址 |
| `CHROMA_HOST` / `CHROMA_PORT` | `localhost` / `8100` | ChromaDB 連線 |
| `OPC_SERVER_URL` | `opc.tcp://localhost:4840/...` | OPC UA 伺服器位址 |
| `OPC_SERVICE_HOST` / `OPC_SERVICE_PORT` | `0.0.0.0` / `8001` | OPC 微服務綁定 |
| `OPC_WRITE_WHITELIST` | （空，不限制） | 允許寫入的標籤名稱前綴（逗號分隔） |
| `OPC_SIM_ENABLED` | `false` | 啟用模擬 OPC 伺服器 |
| `OPC_SIM_PORT` | `4840` | 模擬伺服器連接埠 |
| `EVOL_ARCHIVE_DIR` | `backend/data/archives` | JSONL 存檔目錄 |

## 技術棧

| 元件 | 技術 | 版本 |
| --- | --- | --- |
| 核心閉環 | LangGraph + LiteLLM | ≥0.2.50 / ≥1.52 |
| 後端 API | FastAPI + uvicorn | ≥0.115 |
| 多代理人公司 | 自研運行時（company/） | — |
| 向量資料庫 | ChromaDB | ≥0.5 |
| 會話快取 | Redis | ≥5.2 |
| 工業協議 | OPC UA（asyncua） | ≥1.1 |
| 前端 | React + Vite + TypeScript | 待實作 |
| 提示優化 | DSPy | 待實作 |
| 部署 | Docker Compose | — |
| 測試 | pytest + pytest-asyncio | ≥8.3 / ≥0.24 |

## 測試

### 冒煙測試（無需 API）

```powershell
# 向量記憶庫冒煙測試（add / search / cleanup / reset）
python -m backend.scripts.smoke_test
```

### pytest 測試套件

```powershell
# 執行全部測試
pytest backend/tests/

# 執行特定模組測試
pytest backend/tests/test_reflection_loop.py   # 反思迴圈
pytest backend/tests/test_company.py           # 多代理人公司
pytest backend/tests/test_opc_service.py       # OPC 服務
pytest backend/tests/test_archiver.py          # 文本化存檔
```

測試使用 mock / patch 隔離 LLM 呼叫與外部服務，無需真實 API 金鑰即可執行。

目前共 126 個測試案例，覆蓋：

| 測試類別 | 測試檔 | 涵蓋範圍 |
| --- | --- | --- |
| 反思迭代迴圈 | `test_reflection_loop.py` | 高分通過、低分迭代、最大迭代上限、記憶檢索 |
| 公司狀態與預算 | `test_company.py` | 工作項狀態機、預算管理、模型路由、成本追蹤 |
| 任務拆分器 | `test_company.py` | LLM/模板/規則三策略、自動策略選擇、並行規劃、依賴解析 |
| 公司協調器 | `test_company.py` | 完整執行流程、審查退回、預算追蹤、看板 |
| PromptConfig 自定義 | `test_company.py` | 部分覆蓋、全欄位自定義、多注入路徑 |
| 事件系統 | `test_company.py` | EventBus 基礎功能、多監聽器、異常安全、完整事件枚舉 |
| 錯誤處理 | `test_company.py` | RetryConfig、重試邏輯、角色升級、停用升級 |
| 檢查點 | `test_company.py` | 序列化、工作項欄位完整性、狀態恢復 |
| 優先級與工作池 | `test_company.py` | Priority 排序、Semaphore 並行限制 |
| EvoLoop 圖整合 | `test_company.py` | 公司模式路由、迭代迴圈、失敗跳過迭代 |
| OPC 服務 | `test_opc_service.py` | 白名單、邊界檢查、審計日誌、REST/WebSocket API |
| 文本化存檔 | `test_archiver.py` | JSONL 寫入、反思映射、完整圖存檔 |

## 開發路線

| 階段 | 內容 | 狀態 |
| --- | --- | --- |
| Phase 0 | 環境建設 | ✅ 完成 |
| Phase 1 | 核心反思閉環 | ✅ 完成 |
| Phase 2 | 記憶與向量庫（ChromaDB） | ✅ 完成 |
| Phase 3 | FastAPI 服務 | ✅ 完成 |
| Phase 4 | 前端介面 | 待實作 |
| Phase 5 | DSPy 提示優化 | 待實作 |
| Phase 6 | 多代理人公司運行時 | ✅ 完成 |
| Phase 7 | OPC UA 工業整合 | ✅ 完成 |
| Phase 8 | 測試部署監控（含 Task 8.6 文本化存檔） | ✅ 完成 |
| Phase 9 | 文件 | 進行中 |
