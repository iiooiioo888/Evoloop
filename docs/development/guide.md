# 開發指南

## 環境需求

| 工具 | 版本 | 說明 |
|------|------|------|
| Python | 3.10-3.12 | 後端運行時 |
| Node.js | 20+ | 前端構建 |
| Docker | 可選 | 容器化部署 |

## 本地開發

```bash
# 克隆倉庫
git clone https://github.com/iiooiioo888/Evoloop.git
cd Evoloop

# 虛擬環境
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\Activate.ps1  # Windows

# 安裝依賴
pip install -r requirements.txt

# 設定環境變數
cp .env.example .env
# 編輯 .env 填入你的 API 金鑰

# 啟動後端
python -m backend.main

# 啟動前端
cd frontend && npm install && npm run dev
```

## 測試

```bash
# 全部測試（185+ 案例，無需 API 金鑰）
pytest backend/tests/ -q

# 分類測試
pytest backend/tests/test_company.py         # 公司運行時
pytest backend/tests/test_opc_service.py     # OPC 工業閉環
pytest backend/tests/test_reflection_loop.py # 反思迴圈
pytest backend/tests/test_architecture.py    # 架構約束

# 指定臨時目錄（Windows 權限問題時）
pytest backend/tests/ --basetemp=.pytest_tmp
```

## 專案結構

```
backend/
├── core/               # 核心模組
│   ├── graph.py        #   統一模式圖定義
│   ├── nodes.py        #   核心節點實現
│   ├── company_nodes.py#   公司運行時節點
│   ├── evaluation.py   #   多維度評估引擎
│   ├── llm_cache.py    #   LLM 語義快取
│   ├── llm.py          #   LiteLLM 統一調用層
│   └── state.py        #   狀態模型
├── company/            # 公司運行時
├── memory/             # 向量記憶庫
├── services/           # 營運服務
├── prompts/            # Prompt 模板
├── config/             # 配置文件
└── tests/              # 測試
```

## 關鍵約束

1. **LLM 調用**：統一使用 `backend.core.llm.call_llm`，禁止直接調用 SDK
2. **測試隔離**：使用 `monkeypatch` 隔離外部依賴，無需真實 API 金鑰
3. **圖狀態**：禁止直接修改編譯後的 LangGraph 圖，所有變更通過 `build_graph()`
4. **OPC 安全**：所有寫入必須經 `WriteGuard` 護欄檢查

## 擴展點

### 添加新的評估維度

1. 在 `backend/core/evaluation.py` 的 `DIMENSION_WEIGHTS` 中添加
2. 在 `MULTI_DIM_EVALUATE_PROMPT` 中添加維度說明
3. 在 `RuleBasedFallback` 中添加規則評估邏輯

### 添加新的組織模板

1. 在 `backend/company/roles.py` 的 `BUILTIN_TEMPLATES` 中添加
2. 定義角色配置和預算

### 添加新的 OPC 感測器

1. 在 `opc_service/simulator/` 中添加模擬數據
2. 在 `opc_service/analyze.py` 的 `DEFAULT_THRESHOLDS` 中添加閾值

### 更換 LLM 供應商

1. 設置對應的 API Key 環境變數
2. 設置 `EVOL_MODEL` 為目標模型
3. 如使用自訂端點，設置 `api_base`

## 調試

### 查看 LangGraph 執行軌跡

```bash
# 通過 API 查看
curl http://localhost:8000/tasks/{task_id}/trace

# 通過前端 TraceView 查看
# http://localhost:5173 → 執行軌跡標籤
```

### 查看 LLM 快取統計

```python
from backend.core.llm_cache import get_llm_cache
stats = get_llm_cache().stats
# {"hits": 42, "misses": 10, "semantic_hits": 5, "evictions": 2}
```

### 查看向量記憶庫

```python
from backend.memory.vector_store import VectorMemoryStore
store = VectorMemoryStore()
print(f"記憶總數: {store.count()}")
memories = store.all()
```
