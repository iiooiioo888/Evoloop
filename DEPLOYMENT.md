# 🚀 部署到 GitHub Pages

本專案的前端 UI 已配置自動部署到 GitHub Pages。

## ✅ 已完成配置

- [x] GitHub Actions workflow (`.github/workflows/deploy-pages.yml`)
- [x] Vite 構建配置
- [x] React + TypeScript 前端應用

## 📋 部署步驟

### 1. 推送到 GitHub

```bash
# 添加你的 GitHub 倉庫作為 remote
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# 推送到 main 分支
git push -u origin main
```

### 2. 啟用 GitHub Pages

1. 前往你的 GitHub 倉庫頁面
2. 點擊 **Settings** > **Pages**
3. 在 **Build and deployment** 下：
   - **Source**: 選擇 `GitHub Actions`
4. 系統會自動讀取 `.github/workflows/deploy-pages.yml` 配置

### 3. 查看部署狀態

- 推送後，GitHub Actions 會自動觸發構建和部署
- 在 **Actions** 標籤頁查看部署進度
- 部署完成後，會在 **Settings** > **Pages** 看到你的網站 URL

格式通常為：
```
https://YOUR_USERNAME.github.io/YOUR_REPO/
```

## 🔧 手動測試構建

在本地測試構建：

```bash
cd frontend
npm install
npm run build
```

構建輸出會在 `frontend/dist` 目錄。

## 🎨 UI 預覽

部署完成後，你將看到一個現代化的 IDE 風格 AI 助手介面，包含：

- 💬 聊天視圖（支援串流回應）
- 📊 監控儀表板
- 🔍 執行軌跡檢視
- ⚙️ LLM 配置設定
- 🏭 OPC 診斷面板（工業整合）

## ⚠️ 注意事項

- 確保推送到 `main` 或 `master` 分支才會觸發部署
- 首次部署可能需要 1-2 分鐘
- 如需自訂域名，可在 GitHub Pages 設定中配置

---

**EvoLoop** - 自我反思 × 多代理人公司 × 工業閉環 🔄
