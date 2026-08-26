# OPC 工業整合

OPC 整合將工業數據感知能力融入 EvoLoop 統一管線，實現 **6 級工業閉環**。

## 流程

```
S1 感知 → P1 預處理 → A1 分析 → Dg1 診斷 → D1 決策 → A2 執行 → END
```

| 階段 | 職責 | 依賴 |
|------|------|------|
| S1 感知 | 讀取原始感測器數據 | OPC UA 伺服器 |
| P1 預處理 | 數據清洗、品質過濾、標準化 | S1 |
| A1 分析 | 統計計算、閾值違規檢測、趨勢識別 | P1 |
| Dg1 診斷 | LLM 深度分析、異常檢測與根因分析 | A1 |
| D1 決策 | 控制策略制定、優先級排序、風險評估 | Dg1 |
| A2 執行 | 寫入控制動作（經安全護欄）、結果驗證 | D1 |

## 觸發條件

查詢包含工業關鍵詞時自動注入 OPC 上下文：

- 中文：感測、溫度、壓力、流量、閥門、馬達、設備、製程、工業、產線
- 英文：opc, sensor, temperature, pressure, flow, valve, motor, industrial, plc

## 安全護欄

所有寫入操作必須通過 `WriteGuard` 檢查：

1. **白名單檢查**：標籤必須在 `OPC_WRITE_WHITELIST` 中
2. **邊界檢查**：數值必須在安全範圍內

```python
guard = WriteGuard()
passed, message = guard.validate_write("Temperature", 85.0)
```

## 模擬伺服器

設置 `OPC_SIM_ENABLED=true` 啟用內建模擬器：

- 溫度 (Temperature): 20-100°C
- 壓力 (Pressure): 0-250 bar
- 流量 (FlowRate): 0-120 L/min
- 閥門位置 (ValvePosition): 0-100%
- 馬達轉速 (MotorSpeed): 0-3500 RPM

## 超時降級（優化 #10）

每級帶超時保護，超時時使用上一級緩存結果繼續：

```python
OPC_STAGE_TIMEOUT = 30  # 每級超時（秒）
```

降級標記：
```json
{
  "_degraded": true,
  "_degraded_stage": "analyze",
  "_degraded_reason": "analyze 超時（30s）"
}
```

## 人工確認（可選）

關鍵執行級可啟用人工確認：

```bash
OPC_ACT_HUMAN_CONFIRM=true
```

啟用後，控制動作不會自動執行，而是標記為 `pending_confirmation`。

## 雙協議

- **REST API**：單次讀取/寫入
- **WebSocket**：即時訂閱感測數據變化

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `OPC_SIM_ENABLED` | `false` | 啟用模擬 OPC 伺服器 |
| `OPC_WRITE_WHITELIST` | — | 寫入白名單（逗號分隔） |
| `OPC_STAGE_TIMEOUT` | `30` | 每級超時（秒） |
| `OPC_ACT_HUMAN_CONFIRM` | `false` | 執行級人工確認 |
