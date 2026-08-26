# 🚀 部署到 GitHub Pages

本專案的前端 UI 已配置自動部署到 GitHub Pages。

正式網址：https://iiooiioo888.github.io/Evoloop/

## ✅ 已完成配置

- [x] GitHub Actions workflow (`.github/workflows/deploy-pages.yml`)
- [x] Vite `base` 設為 `/Evoloop/`（僅 Pages 構建）
- [x] React + TypeScript 前端應用
- [x] 靜態預覽降級資料（監控中心角色工作台）

## 📋 部署步驟

### 1. 推送到 GitHub

```bash
git remote add origin https://github.com/iiooiioo888/Evoloop.git
git push -u origin master
```

遠端已存在時直接 `git push origin master`。

### 2. 啟用 GitHub Pages

1. 前往 https://github.com/iiooiioo888/Evoloop
2. 點擊 **Settings** > **Pages**
3. 在 **Build and deployment** 下：
   - **Source**: 選擇 `GitHub Actions`
4. 系統會讀取 `.github/workflows/deploy-pages.yml`

### 3. 查看部署狀態

- 推送後，GitHub Actions 會自動構建並部署
- 在 **Actions** 標籤頁查看 `Deploy to GitHub Pages`
- 完成後開啟：https://iiooiioo888.github.io/Evoloop/

## 🔧 手動測試構建

```bash
cd frontend
npm install
$env:VITE_BASE="/Evoloop/"
$env:VITE_GITHUB_PAGES="true"
npm run build
npm run preview -- --base /Evoloop/
```

構建輸出會在 `frontend/dist` 目錄。

## 🎨 UI 預覽

部署完成後可見 IDE 風格介面：

- 💬 聊天視圖（Pages 上無後端，僅展示殼層）
- 📊 監控中心（每位角色獨立 Agent 工作台 + 降級資料）
- 🛰️ AI Hub
- 🔍 執行軌跡
- ⚙️ LLM / 角色設定

## ⚠️ 注意事項

- 推送到 `main` 或 `master` 才會觸發部署
- GitHub Pages 只託管靜態前端，不含 FastAPI / Redis / OPC
- 首次部署約 1–2 分鐘；若 Actions 失敗，多半是尚未把 Pages Source 設成 GitHub Actions

---

**EvoLoop** - 自我反思 × 多代理人公司 × 工業閉環 🔄
