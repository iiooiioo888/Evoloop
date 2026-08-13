# 📚 EvoLoop 知識庫

> 自我反思 × 多代理人公司 × 工業閉環 — 永不停止進化的 AI 系統

## 目錄

### 🏗️ 架構

- [架構總覽](architecture/overview.md) — 統一管線、三層能力、數據流
- [反思閉環](architecture/reflection-loop.md) — 評分 → 反思 → 改進迭代機制
- [公司運行時](architecture/company-runtime.md) — 多代理人協調、工作項狀態機、預算管控
- [OPC 工業整合](architecture/opc-integration.md) — 6 級閉環、安全護欄、超時降級

### 📡 API

- [REST API 參考](api/reference.md) — 端點、請求/回應格式、SSE 串流、WebSocket

### ⚙️ 配置

- [配置參考](config/reference.md) — 環境變數、模型價格、預算、LLM 配置

### 🛠️ 開發

- [開發指南](development/guide.md) — 專案結構、測試、調試、擴展點

### 🚀 部署

- [部署指南](deployment/guide.md) — Docker Compose、GitHub Pages、生產環境

---

## 快速導航

| 我想… | 去這裡 |
|--------|--------|
| 了解系統整體架構 | [架構總覽](architecture/overview.md) |
| 查看 API 端點 | [REST API 參考](api/reference.md) |
| 配置 LLM 模型 | [配置參考](config/reference.md) |
| 本地開發調試 | [開發指南](development/guide.md) |
| 部署到生產環境 | [部署指南](deployment/guide.md) |
| 理解反思閉環如何工作 | [反思閉環](architecture/reflection-loop.md) |
| 理解多代理人如何協作 | [公司運行時](architecture/company-runtime.md) |
| 接入工業設備 | [OPC 整合](architecture/opc-integration.md) |
