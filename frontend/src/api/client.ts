/**
 * EvoLoop 後端 API 客戶端。
 *
 * 適配遠程版後端：僅提供 POST /chat（同步回傳完整回答）
 * 與 GET /health；串流、回饋、歷史端點待後端支援後啟用。
 *
 * 開發環境透過 Vite 代理（/api → http://localhost:8000）；
 * 生產環境可設定 VITE_API_URL 環境變數指向後端位址。
 */

import type { TaskProgress } from '../types';

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

/** 建立後台任務（標準/公司模式），回傳 task_id。 */
export async function createTask(
  query: string,
  companyMode: boolean,
  companyTemplate: string,
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
