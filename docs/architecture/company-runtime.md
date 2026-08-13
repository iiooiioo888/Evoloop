# 公司運行時

複雜任務自動觸發多代理人公司運行時：**Manager 分解 → 多角色並行執行 → Reviewer 審查 → Synthesizer 整合**。

## 觸發條件

任務被判定為「複雜」時自動啟用：

- 查詢長度 ≥ 200 字符
- 包含關鍵詞：開發、設計、構建、實現、系統、架構、重構、deploy、build、implement 等
- 執行策略顯式設為 `company`

## 角色體系

```
Level 0: Manager（經理）      — 目標分解、最終審查
Level 1: Tech Lead（技術主管） — 技術方案設計
Level 2: Domain Lead（領域主管）— 領域專家
Level 3: Executor（執行者）    — 具體任務執行
Level 4: Support（支援）       — 輔助工作
```

## 組織模板

| 模板 | 適用場景 | 角色配置 |
|------|----------|----------|
| `quick_task` | 快速任務 | 精簡團隊 |
| `page_dev` | 頁面開發 | 前端為主 |
| `fullstack_app` | 全端開發 | 完整團隊 |
| `research_report` | 研究報告 | 研究為主 |
| `full_company` | 完整公司 | 全角色啟用 |

## 執行流程

```
階段 1: TaskDecomposer 分解目標
  │  三策略：LLM / 模板 / 規則（預算壓力下自動降級）
  ▼
工作項 DAG（依賴 + 優先級排序）
  │
  ▼
階段 2: 執行-審查迴圈
  │  並行執行池（Semaphore 限流，自適應並發）
  │  Developer 角色依優先級執行
  ▼
Reviewer 審查閘
  ├─ ✅ 通過 → Done
  └─ ❌ 不通過 → Rework（最多 N 輪，失敗後角色升級）
  ▼
階段 3: Synthesizer 整合
  │
  ▼
階段 4: Manager 最終審查
  │
  ▼
外部反思迴圈（評估 → 反思 → 改進）
```

## 工作項狀態機

```
Planning → Ready → Executing → In Review → Done
                        ↑           │
                        └─ Rework ──┘
                                    │
                              Blocked（失敗）
```

## 預算管控

### 模型路由

根據任務複雜度和預算壓力自動選擇模型：

| 層級 | 適用場景 | 預設模型 |
|------|----------|----------|
| `SUMMARY` | 低複雜度 | gpt-4o-mini |
| `ROUTINE` | 中複雜度 | gpt-4o-mini |
| `REASONING` | 高複雜度 | gpt-4o |
| `CRITICAL` | 關鍵任務 | gpt-4o |

### 預算壓力

```
壓力 = max(任務花費/任務上限, 會話花費/會話上限, 月度花費/月度上限)
```

- 壓力 < 警告閾值：正常運行
- 壓力 ≥ 警告閾值：日誌警告 + 建議優化
- 壓力 ≥ 降級閾值：自動切換到便宜模型
- 壓力 ≥ 1.0：硬停止

### Docker 容器成本

類似雲端按量付費：`費用 = 小時費率 × 運行時長`，計入月度預算。

## 自適應並發控制（優化 #6）

根據 API 響應動態調節並行數：

```
有 429 錯誤 → 並發數 - 1
響應穩定（< 5s）→ 並發數 + 1
上限：配置值的 2 倍
調整週期：30 秒
```

## 錯誤回退（優化 #2）

公司運行時失敗時的降級策略：

```
成功 → evaluate_answer（進入反思迴圈）
失敗但有部分產出（> 50 字）→ evaluate_answer（嘗試反思修復）
失敗且無產出 → archive_state → END
```

## 事件系統

13 種生命週期事件，非阻塞 EventBus：

```
COMPANY_START → PHASE_CHANGE → DECOMPOSE_DONE
→ WORK_ITEM_START → WORK_ITEM_DONE → REVIEW_PASS/REWORK
→ TOOL_CALL → TOOL_RESULT
→ COMPANY_DONE → FINAL_REVIEW_DEGRADED
```

## 檢查點

支持中斷恢復：

```python
# 序列化
checkpoint = orchestrator.to_checkpoint(goal)

# 恢復
orchestrator = CompanyOrchestrator.from_checkpoint(checkpoint)
```

包含：所有工作項狀態、預算、日誌、run_id。
