/**
 * EvoLoop 後端 API 客戶端。
 *
 * 適配遠程版後端：僅提供 POST /chat（同步回傳完整回答）
 * 與 GET /health；串流、回饋、歷史端點待後端支援後啟用。
 *
 * 開發環境透過 Vite 代理（/api → http://localhost:8000）；
 * 生產環境可設定 VITE_API_URL 環境變數指向後端位址。
 */

import type { CloudAlertsData, CloudBilling, CloudEventsData, CloudMonitoring, DashboardData, DockerActionResult, DockerBudget, DockerStatus, TaskProgress } from '../types';

const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api';

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export interface ChatOptions {
  /** 公司模式：多代理人分工處理複雜目標 */
  companyMode?: boolean;
  /** 公司組織模板（company_mode 為 true 時生效） */
  companyTemplate?: string;
}

export interface ChatResult {
  session_id: string;
  answer: string;
  score: number | null;
  iteration: number;
}

/** 送出聊天並取得完整回答（同步模式，支援公司模式）。 */
export async function sendChat(
  query: string,
  sessionId: string,
  options: ChatOptions = {},
): Promise<ChatResult> {
  let resp: Response;
  try {
    resp = await fetch(apiUrl('/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        session_id: sessionId,
        company_mode: options.companyMode ?? false,
        company_template: options.companyTemplate ?? 'quick_task',
      }),
    });
  } catch {
    throw new Error('網路連線失敗，請檢查後端服務是否啟動');
  }

  if (!resp.ok) {
    throw new Error(`請求失敗（HTTP ${resp.status}）`);
  }
  const data = await resp.json();
  return {
    session_id: data.session_id ?? sessionId,
    answer: data.answer ?? '',
    score: data.score ?? null,
    iteration: data.iteration ?? 0,
  };
}

/** 送出 👍/👎 回饋（盡力而為：後端尚未提供 /feedback 時靜默忽略）。 */
export async function sendFeedback(sessionId: string, rating: 1 | 2): Promise<void> {
  try {
    await fetch(apiUrl('/feedback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, rating }),
    });
  } catch {
    // 後端未提供回饋端點時不影響體驗
  }
}

// ==================== LLM 配置 ====================

export interface LlmConfig {
  configured: boolean;
  api_key: string; // 脱敏後的金鑰
  api_base: string;
  model: string;
}

/** 取得当前 LLM 配置狀態。 */
export async function fetchConfig(): Promise<LlmConfig> {
  const resp = await fetch(apiUrl('/config'));
  if (!resp.ok) throw new Error(`讀取配置失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 儲存 LLM 配置（api_key 傳空字串表示不變更可另處理）。 */
export async function saveConfig(config: {
  api_key?: string;
  api_base?: string;
  model?: string;
}): Promise<LlmConfig> {
  const resp = await fetch(apiUrl('/config'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!resp.ok) throw new Error(`儲存配置失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 以当前配置測試 LLM 連線。 */
export async function testConfig(): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const resp = await fetch(apiUrl('/config/test'), { method: 'POST' });
  if (!resp.ok) throw new Error(`測試請求失敗（HTTP ${resp.status}）`);
  return resp.json();
}

// ==================== 任務介面 ====================

/** 建立後台任務（標準/公司/OPC 模式），回傳 task_id。 */
export async function createTask(
  query: string,
  companyMode: boolean,
  companyTemplate: string,
  opcMode: boolean = false,
): Promise<{ task_id: string; mode: string }> {
  let resp: Response;
  try {
    resp = await fetch(apiUrl('/tasks'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        company_mode: companyMode,
        company_template: companyTemplate,
        opc_mode: opcMode,
      }),
    });
  } catch {
    throw new Error('網路連線失敗，請檢查後端服務是否啟動');
  }
  if (!resp.ok) throw new Error(`建立任務失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 查詢任務進度。 */
export async function fetchTask(taskId: string): Promise<TaskProgress> {
  const resp = await fetch(apiUrl(`/tasks/${encodeURIComponent(taskId)}`));
  if (!resp.ok) throw new Error(`查詢任務失敗（HTTP ${resp.status}）`);
  return resp.json();
}

// ==================== 控制面版 ====================

/** 取得控制面版聚合資料（統計/任務/存檔/審計/能力）。 */
export async function fetchDashboard(): Promise<DashboardData> {
  const resp = await fetch(apiUrl('/dashboard'));
  if (!resp.ok) throw new Error(`讀取控制面版失敗（HTTP ${resp.status}）`);
  return resp.json();
}

// ==================== Docker 容器管理 ====================

/** 獲取 Docker 狀態摘要（容器列表 + 健康檢查）。 */
export async function fetchDockerStatus(): Promise<DockerStatus> {
  const resp = await fetch(apiUrl('/docker/status'));
  if (!resp.ok) throw new Error(`讀取 Docker 狀態失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 獲取 Docker 容器預算狀態（公司全權控制）。 */
export async function fetchDockerBudget(): Promise<DockerBudget> {
  const resp = await fetch(apiUrl('/docker/budget'));
  if (!resp.ok) throw new Error(`讀取 Docker 預算失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 獲取容器資源使用統計。 */
export async function fetchDockerStats(): Promise<{ stats: Record<string, import('../types').DockerContainerStats> }> {
  const resp = await fetch(apiUrl('/docker/stats'));
  if (!resp.ok) throw new Error(`讀取 Docker 統計失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 獲取指定服務日誌。 */
export async function fetchDockerLogs(service: string, tail: number = 100): Promise<{ service: string; tail: number; logs: string }> {
  const resp = await fetch(apiUrl(`/docker/logs/${encodeURIComponent(service)}?tail=${tail}`));
  if (!resp.ok) throw new Error(`讀取日誌失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 重啟指定服務。 */
export async function restartDockerService(service: string): Promise<DockerActionResult> {
  const resp = await fetch(apiUrl(`/docker/restart/${encodeURIComponent(service)}`), { method: 'POST' });
  if (!resp.ok) throw new Error(`重啟失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 停止指定服務。 */
export async function stopDockerService(service: string): Promise<DockerActionResult> {
  const resp = await fetch(apiUrl(`/docker/stop/${encodeURIComponent(service)}`), { method: 'POST' });
  if (!resp.ok) throw new Error(`停止失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 啟動指定服務。 */
export async function startDockerService(service: string): Promise<DockerActionResult> {
  const resp = await fetch(apiUrl(`/docker/start/${encodeURIComponent(service)}`), { method: 'POST' });
  if (!resp.ok) throw new Error(`啟動失敗（HTTP ${resp.status}）`);
  return resp.json();
}

// ═══════════════════════════════════════════════════════════
// 雲控制台 API
// ═══════════════════════════════════════════════════════════

/** 獲取雲端費用摘要。 */
export async function fetchCloudBilling(): Promise<CloudBilling> {
  const resp = await fetch(apiUrl('/cloud/billing'));
  if (!resp.ok) throw new Error(`讀取費用失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 獲取資源監控歷史數據。 */
export async function fetchCloudMonitoring(range: string = '1h'): Promise<CloudMonitoring> {
  const resp = await fetch(apiUrl(`/cloud/monitoring?range=${range}`));
  if (!resp.ok) throw new Error(`讀取監控數據失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 獲取最新資源快照。 */
export async function fetchCloudMonitoringLatest(): Promise<{ services: Record<string, { cpu: number; mem_mb: number }>; ts: string | null }> {
  const resp = await fetch(apiUrl('/cloud/monitoring/latest'));
  if (!resp.ok) throw new Error(`讀取最新快照失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 獲取容器事件時間線。 */
export async function fetchCloudEvents(limit: number = 50): Promise<CloudEventsData> {
  const resp = await fetch(apiUrl(`/cloud/events?limit=${limit}`));
  if (!resp.ok) throw new Error(`讀取事件失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 獲取告警規則與歷史。 */
export async function fetchCloudAlerts(): Promise<CloudAlertsData> {
  const resp = await fetch(apiUrl('/cloud/alerts'));
  if (!resp.ok) throw new Error(`讀取告警失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 創建告警規則。 */
export async function createAlertRule(rule: { name: string; metric: string; threshold: number; service: string }): Promise<Record<string, unknown>> {
  const resp = await fetch(apiUrl('/cloud/alerts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  if (!resp.ok) throw new Error(`創建告警失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 切換告警規則啟用狀態。 */
export async function toggleAlertRule(ruleId: string): Promise<Record<string, unknown>> {
  const resp = await fetch(apiUrl(`/cloud/alerts/${encodeURIComponent(ruleId)}/toggle`), { method: 'POST' });
  if (!resp.ok) throw new Error(`切換告警失敗（HTTP ${resp.status}）`);
  return resp.json();
}

/** 刪除告警規則。 */
export async function deleteAlertRule(ruleId: string): Promise<{ deleted: boolean }> {
  const resp = await fetch(apiUrl(`/cloud/alerts/${encodeURIComponent(ruleId)}`), { method: 'DELETE' });
  if (!resp.ok) throw new Error(`刪除告警失敗（HTTP ${resp.status}）`);
  return resp.json();
}
