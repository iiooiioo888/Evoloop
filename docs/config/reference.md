# 配置參考

## 環境變數總覽

### 必填

| 變數 | 說明 |
|------|------|
| `OPENAI_API_KEY` | LLM 金鑰（支援 OpenAI / Claude / Gemini） |

### LLM 配置

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `EVOL_MODEL` | `gpt-4o` | 預設模型 |
| `EVOL_EMBED_MODEL` | `text-embedding-3-small` | 嵌入模型（用於記憶檢索和語義快取） |

### 反思閉環

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `EVOL_PASS_THRESHOLD` | `8` | 通過門檻分數（0-10） |
| `EVOL_MAX_ITERATIONS` | `3` | 最大迭代次數 |
| `EVOL_MIN_SCORE_IMPROVEMENT` | `0.5` | 最小分數提升（低於此值提前終止） |
| `EVOL_CROSS_EVAL_MODEL` | — | 交叉評估模型（不設置則跳過） |

### LLM 快取

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `EVOL_LLM_CACHE_SIZE` | `512` | 快取條目上限 |
| `EVOL_LLM_CACHE_TTL` | `3600` | 快取 TTL（秒） |
| `EVOL_SEMANTIC_CACHE` | `true` | 是否啟用語義快取 |
| `EVOL_SEMANTIC_THRESHOLD` | `0.92` | 語義相似度閾值 |

### 向量記憶庫

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `CHROMA_HOST` | — | ChromaDB 主機（不設置則用本地） |
| `CHROMA_PORT` | `8100` | ChromaDB 端口 |
| `EVOL_CHROMA_COLLECTION` | `evo_memory` | Collection 名稱 |
| `EVOL_CHROMA_DIR` | `backend/data/chroma` | 本地持久目錄 |
| `EVOL_SEARCH_CACHE_SIZE` | `128` | 檢索快取大小 |
| `EVOL_SIMILARITY_THRESHOLD` | `1.2` | 靜態相似度門檻 |
| `EVOL_THRESHOLD_PERCENTILE` | `75` | 自適應門檻百分位 |

### Redis

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis 連線 |

### 狀態存儲

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `EVOL_STATE_BACKEND` | `auto` | 存儲後端（`redis` / `jsonl` / `memory` / `auto`） |
| `EVOL_STATE_DIR` | `backend/data/state` | JSONL 存儲目錄 |

### OPC 工業整合

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `OPC_SIM_ENABLED` | `false` | 啟用模擬 OPC 伺服器 |
| `OPC_WRITE_WHITELIST` | — | 寫入白名單（逗號分隔） |
| `OPC_STAGE_TIMEOUT` | `30` | 每級超時（秒） |
| `OPC_ACT_HUMAN_CONFIRM` | `false` | 執行級人工確認 |

### 預算管控

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `EVOL_MODEL_COSTS_PATH` | — | 模型價格配置文件路徑 |

### Docker

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `DOCKER_COMPOSE_PROJECT` | — | Docker Compose 項目名 |

## 模型價格配置

文件路徑：`backend/config/model_costs.json`

```json
{
  "gpt-4o": [2.50, 10.00],
  "gpt-4o-mini": [0.15, 0.60],
  "deepseek-chat": [0.14, 0.28],
  "qwen-turbo": [0.05, 0.10]
}
```

格式：`[input_cost_per_1M_tokens, output_cost_per_1M_tokens]`

支持運行時熱更新：
```python
from backend.company.budget import reload_model_costs
reload_model_costs()
```

## .env.example

```bash
# 必填
OPENAI_API_KEY=sk-your-key-here

# 模型
EVOL_MODEL=gpt-4o

# 反思閉環
EVOL_PASS_THRESHOLD=8
EVOL_MAX_ITERATIONS=3

# Redis
REDIS_URL=redis://localhost:6379/0

# ChromaDB
CHROMA_HOST=localhost
CHROMA_PORT=8100

# OPC
OPC_SIM_ENABLED=true
```
