# 部署指南

## Docker Compose（推薦）

### 一鍵部署

```bash
# 全部服務
docker compose up -d

# 僅基礎設施（Redis + ChromaDB）
docker compose up -d redis chroma

# 查看日誌
docker compose logs -f backend
```

### 服務端口

| 服務 | 端口 | 說明 |
|------|------|------|
| `backend` | 8000 | FastAPI + LangGraph 核心 |
| `frontend` | 5173 / 80 | React + Vite（dev/prod） |
| `opc_service` | 8001 | OPC UA 微服務 |
| `redis` | 6379 | 任務持久化 |
| `chroma` | 8100 | 向量記憶庫 |

### 環境變數

在項目根目錄創建 `.env`：

```bash
OPENAI_API_KEY=sk-your-key-here
EVOL_MODEL=gpt-4o
```

### 健康檢查

```bash
# 後端
curl http://localhost:8000/health

# ChromaDB
curl http://localhost:8100/api/v1/heartbeat

# Redis
docker compose exec redis redis-cli ping
```

## 本地開發部署

```bash
# 後端
python -m backend.main

# 前端
cd frontend && npm install && npm run dev

# OPC 微服務（含模擬器）
OPC_SIM_ENABLED=true python -m opc_service.main
```

## GitHub Pages（前端）

項目已配置 GitHub Actions 自動部署前端到 GitHub Pages。

1. 推送到 `main` 或 `master` 分支
2. 前往倉庫 Settings → Pages
3. Source 選擇 `GitHub Actions`
4. 等待 Actions 完成

網址：`https://YOUR_USERNAME.github.io/YOUR_REPO/`

## 生產環境建議

### 安全

- 使用 HTTPS
- 設置 CORS 白名單（替換 `allow_origins=["*"]`）
- 啟用 API Key 認證
- OPC 寫入白名單限制

### 性能

- Redis 持久化（AOF + RDB）
- ChromaDB 使用 HttpClient（非本地）
- 後端多 worker：`uvicorn backend.main:app --workers 4`
- 前端 Nginx 反向代理

### 監控

- 使用 `/dashboard` API 監控系統狀態
- 使用 `/cloud/monitoring` 監控資源使用
- 設置告警規則（`/cloud/alerts`）

### 備份

- Redis：定期 `BGSAVE`
- ChromaDB：備份持久目錄
- JSONL 存檔：備份 `backend/data/archives/`
