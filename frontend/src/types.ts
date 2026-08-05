/** 任務進度事件 */
export interface TaskEvent {
  ts: number;
  event: string;
  data: Record<string, unknown>;
}

/** 看板上的工作項（含產出物與審查反饋） */
export interface KanbanItem {
  id: string;
  title: string;
  description?: string;
  assignee?: string | null;
  tier?: string;
  depends_on?: string[];
  actual_cost?: number;
  /** 最近審查反饋 */
  feedback?: Record<string, unknown>[];
  /** 產出物預覽 */
  output?: string;
  updated_at?: string;
}

/** 任務即時狀態（POST /tasks + GET /tasks/{id}） */
export interface TaskProgress {
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  mode: 'standard' | 'company';
  query: string;
  template: string;
  phase: string;
  events: TaskEvent[];
  kanban: Record<string, KanbanItem[]>;
  budget: Record<string, unknown>;
  answer: string;
  score: number | null;
  iteration: number;
  error: string;
  /** 公司模式：分解計劃 */
  plan?: {
    subtask_count?: number;
    strategy?: string;
    execution_plan?: unknown;
  } | null;
  /** 公司模式：Manager 最終審查結果 */
  review?: Record<string, unknown> | null;
  /** 公司模式：工作項統計 */
  stats?: Record<string, unknown> | null;
  /** 任務建立時間（Unix 秒） */
  created_at?: number;
}

/** 聊天訊息模型 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** 是否正在生成中 */
  streaming?: boolean;
  /** 使用者回饋：1=👎 2=👍 */
  feedback?: 1 | 2;
  /** 是否以公司模式發送 */
  companyMode?: boolean;
  /** 後台任務 ID */
  taskId?: string;
  /** 任務即時進度 */
  taskState?: TaskProgress;
  /** 後端回傳的 metadata */
  meta?: {
    score?: number | null;
    iteration?: number;
  };
}

/** 單一會話 */
export interface ChatSession {
  id: string;
  /** 會話標題（取第一則使用者訊息） */
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

/** 公司模式組織模板（對應後端 company_template） */
export const COMPANY_TEMPLATES = [
  { value: 'quick_task', label: '快速任務' },
  { value: 'page_dev', label: '頁面開發' },
  { value: 'fullstack_app', label: '全端開發' },
  { value: 'research_report', label: '研究報告' },
  { value: 'full_company', label: '完整公司' },
] as const;

export type CompanyTemplate = (typeof COMPANY_TEMPLATES)[number]['value'];
