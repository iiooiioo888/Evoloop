# EvoLoop

EvoLoop 是一個具備「自我反思閉環」的 AI 助手系統。它不只是單次回答使用者問題，而是透過 **生成 → 評估 → 反思 → 優化** 的迴圈持續改進回答品質，並將成功經驗存入記憶庫（向量資料庫），作為後續回答的 few-shot 提示。最終透過 DSPy 自動優化提示詞，並以多代理人審查保證品質。

## 核心架構

```
使用者查詢
   |
   v
[generate_initial_answer]  生成初始回答
   |
   v
[evaluate_answer]          自動評分（0-10）
   |
   |-- 評分 < 8 --> [reflect] --> [improve_answer] --> 重新評估（迴圈）
   |
   +-- 評分 >= 8 --> [decide_final_answer] --> [save_memory] --> [archive_state] --> 輸出
```

## 專案結構

```
evoloop/
├── backend/            # FastAPI 後端 + LangGraph 核心閉環
│   ├── core/           #   狀態模型、節點、圖定義
│   ├── prompts/        #   參數化 Prompt 模板
│   ├── memory/         #   記憶儲存（Phase 2 導入 ChromaDB）
│   ├── services/       #   營運服務（Task 8.6 文本化存檔）
│   ├── scripts/        #   工具腳本（LLM 連線測試等）
│   └── tests/          #   單元 / 整合測試
├── frontend/           # React + Vite + TypeScript 對話介面
├── opc_service/        # OPC UA 工業數據微服務（Phase 7）
├── dspy_pipeline/      # DSPy 自動提示優化（Phase 5）
└── docker/             # 容器化部署設定
```

## 快速開始

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

# 5. 執行測試
pytest backend/tests/
```

## 技術棧

| 元件 | 技術 |
| --- | --- |
| 核心閉環 | LangGraph + LiteLLM |
| 後端 API | FastAPI |
| 前端 | React + Vite + TypeScript |
| 向量資料庫 | ChromaDB |
| 會話管理 | Redis |
| 提示優化 | DSPy |
| 工業整合 | OPC UA |
| 部署 | Docker Compose |

## 開發路線

Phase 0 環境建設 → Phase 1 核心閉環 → Phase 2 記憶與向量庫 → Phase 3 FastAPI 服務 → Phase 4 前端介面 → Phase 5 DSPy 優化 → Phase 6 多代理人審查 → Phase 7 OPC 整合 → Phase 8 測試部署監控（含 Task 8.6 文本化存檔）→ Phase 9 文件