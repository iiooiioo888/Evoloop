/**
 * 監控中心前端降級目錄。
 *
 * 後端 /monitor/* 不可達時仍畫出九模型與 OPC 標籤，避免整頁黑洞。
 * 數值與 backend/hub/catalog.py、opc_service 模擬標籤對齊。
 */
import type { HubMonitorModel, OpcTagCatalog, RoleAgent } from '../types';
import { blankMetrics } from './agentUi';

export const OPC_FALLBACK_CATALOG: OpcTagCatalog[] = [
  { name: 'Temperature', unit: '°C', desc: '反應槽溫度', range: [0, 150], writable: false },
  { name: 'Pressure', unit: 'kPa', desc: '管線壓力', range: [0, 500], writable: false },
  { name: 'FlowRate', unit: 'L/min', desc: '冷卻水流量', range: [0, 1000], writable: false },
  { name: 'ValvePosition', unit: '%', desc: '控制閥開度', range: [0, 100], writable: true },
  { name: 'MotorSpeed', unit: 'RPM', desc: '主馬達轉速', range: [0, 3000], writable: true },
  { name: 'Level', unit: '%', desc: '儲槽液位', range: [0, 100], writable: false },
  { name: 'AlarmStatus', unit: '', desc: '警報狀態（0=正常, 1=警報）', range: [0, 1], writable: false },
  { name: 'PowerConsumption', unit: 'kW', desc: '設備總功耗', range: [0, 200], writable: false },
];

const HUB_SEED: Array<{
  id: string;
  provider: string;
  intelligence: number;
  latency_ewma_ms: number;
  price_out_per_1m: number;
  price_in_per_1m: number;
}> = [
  { id: 'gpt-5.6-sol', provider: 'openai', intelligence: 96, latency_ewma_ms: 520, price_in_per_1m: 3, price_out_per_1m: 30 },
  { id: 'gemini-3.1-pro', provider: 'google', intelligence: 92, latency_ewma_ms: 480, price_in_per_1m: 1.25, price_out_per_1m: 12 },
  { id: 'mimo-v2.5-pro', provider: 'mimo', intelligence: 88, latency_ewma_ms: 420, price_in_per_1m: 0.21, price_out_per_1m: 0.83 },
  { id: 'qwen3.5-max', provider: 'qwen', intelligence: 86, latency_ewma_ms: 450, price_in_per_1m: 0.3, price_out_per_1m: 1.2 },
  { id: 'kimi-k3', provider: 'moonshot', intelligence: 85, latency_ewma_ms: 540, price_in_per_1m: 0.4, price_out_per_1m: 1.5 },
  { id: 'glm-5.2', provider: 'zhipu', intelligence: 85, latency_ewma_ms: 500, price_in_per_1m: 0.1, price_out_per_1m: 0.4 },
  { id: 'deepseek-v4-flash', provider: 'deepseek', intelligence: 84, latency_ewma_ms: 390, price_in_per_1m: 0.028, price_out_per_1m: 0.157 },
  { id: 'mercury-2', provider: 'inception', intelligence: 78, latency_ewma_ms: 80, price_in_per_1m: 0.5, price_out_per_1m: 2 },
  { id: 'nemotron-3.5-lightning', provider: 'nvidia', intelligence: 74, latency_ewma_ms: 95, price_in_per_1m: 0, price_out_per_1m: 0 },
];

export const HUB_FALLBACK_MODELS: HubMonitorModel[] = HUB_SEED.map((m) => ({
  ...m,
  ttfb_ms: Math.round(m.latency_ewma_ms * 0.2),
  consecutive_fail: 0,
  circuit: { state: 'CLOSED', fail_ratio: 0, window_calls: 0 },
}));

export const HUB_FALLBACK_ROUTING = {
  default_chain: ['gpt-5.6-sol', 'gemini-3.1-pro', 'deepseek-v4-flash', 'glm-5.2'],
  cn_chain: ['deepseek-v4-flash', 'qwen3.5-max', 'mimo-v2.5-pro'],
  race_pair: ['gemini-3.1-pro', 'mercury-2'],
  forbidden_vendor: 'anthropic',
};

const AGENT_SEED: Array<{
  id: string;
  name: string;
  level: number;
  level_label: string;
  category: string;
  reporting_to: string | null;
  can_delegate_to: string[];
  responsibilities: string[];
  max_parallel_work: number;
  default_tier: string;
  templates: string[];
}> = [
  {
    id: 'manager', name: '專案經理', level: 0, level_label: '最高決策層', category: 'management',
    reporting_to: null, can_delegate_to: ['tech_lead', 'architect', 'developer', 'analyst', 'reviewer', 'synthesizer'],
    responsibilities: ['接收目標並分解為工作項', '指派執行者並追蹤進度', '最終審查與預算控制'],
    max_parallel_work: 5, default_tier: 'reasoning',
    templates: ['quick_task', 'fullstack_app', 'page_dev', 'research_report', 'full_company'],
  },
  {
    id: 'tech_lead', name: '技術主管', level: 1, level_label: '技術領導層', category: 'management',
    reporting_to: 'manager', can_delegate_to: ['frontend_lead', 'backend_lead', 'test_lead', 'devops'],
    responsibilities: ['制定技術方向', '審查技術方案', '協調前後端與測試'],
    max_parallel_work: 4, default_tier: 'reasoning', templates: ['fullstack_app', 'page_dev', 'full_company'],
  },
  {
    id: 'architect', name: '架構師', level: 1, level_label: '技術領導層', category: 'management',
    reporting_to: 'manager', can_delegate_to: ['frontend_lead', 'backend_lead', 'devops'],
    responsibilities: ['設計系統架構', '技術選型', '產出架構文件'],
    max_parallel_work: 2, default_tier: 'critical', templates: ['page_dev', 'full_company'],
  },
  {
    id: 'frontend_lead', name: '前端主管', level: 2, level_label: '領域領導層', category: 'js',
    reporting_to: 'tech_lead', can_delegate_to: ['ui_designer', 'css_dev', 'js_dev'],
    responsibilities: ['前端架構', '審查 UI/JS/CSS 品質'],
    max_parallel_work: 3, default_tier: 'reasoning', templates: ['fullstack_app', 'page_dev', 'full_company'],
  },
  {
    id: 'backend_lead', name: '後端主管', level: 2, level_label: '領域領導層', category: 'backend',
    reporting_to: 'tech_lead', can_delegate_to: ['backend_dev', 'devops'],
    responsibilities: ['API 架構', '資料庫模型', '後端品質'],
    max_parallel_work: 3, default_tier: 'reasoning', templates: ['fullstack_app', 'page_dev', 'full_company'],
  },
  {
    id: 'test_lead', name: '測試主管', level: 2, level_label: '領域領導層', category: 'test',
    reporting_to: 'tech_lead', can_delegate_to: ['tester'],
    responsibilities: ['測試策略', '覆蓋率與品質門檻'],
    max_parallel_work: 3, default_tier: 'routine', templates: ['page_dev', 'full_company'],
  },
  {
    id: 'ui_designer', name: 'UI 設計師', level: 3, level_label: '執行層', category: 'ui',
    reporting_to: 'frontend_lead', can_delegate_to: [],
    responsibilities: ['線框圖與視覺設計', '設計系統'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['page_dev', 'full_company'],
  },
  {
    id: 'css_dev', name: 'CSS 開發者', level: 3, level_label: '執行層', category: 'css',
    reporting_to: 'frontend_lead', can_delegate_to: [],
    responsibilities: ['樣式實作', 'RWD 與動畫'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['fullstack_app', 'page_dev', 'full_company'],
  },
  {
    id: 'js_dev', name: 'JS 開發者', level: 3, level_label: '執行層', category: 'js',
    reporting_to: 'frontend_lead', can_delegate_to: [],
    responsibilities: ['前端互動邏輯', '元件與狀態管理'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['fullstack_app', 'page_dev', 'full_company'],
  },
  {
    id: 'backend_dev', name: '後端開發者', level: 3, level_label: '執行層', category: 'backend',
    reporting_to: 'backend_lead', can_delegate_to: [],
    responsibilities: ['API 與業務邏輯', '資料庫與驗證'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['fullstack_app', 'page_dev', 'full_company'],
  },
  {
    id: 'tester', name: '測試工程師', level: 3, level_label: '執行層', category: 'test',
    reporting_to: 'test_lead', can_delegate_to: [],
    responsibilities: ['測試案例', '自動化與缺陷追蹤'],
    max_parallel_work: 3, default_tier: 'routine', templates: ['fullstack_app', 'page_dev', 'full_company'],
  },
  {
    id: 'devops', name: '維運工程師', level: 3, level_label: '執行層', category: 'devops',
    reporting_to: 'tech_lead', can_delegate_to: [],
    responsibilities: ['CI/CD', 'Docker 部署與監控'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['full_company'],
  },
  {
    id: 'developer', name: '通用開發者', level: 3, level_label: '執行層', category: 'backend',
    reporting_to: 'tech_lead', can_delegate_to: ['analyst'],
    responsibilities: ['執行指派工作項', '提交審查'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['quick_task', 'full_company'],
  },
  {
    id: 'reviewer', name: '審查者', level: 4, level_label: '支援角色', category: 'review',
    reporting_to: null, can_delegate_to: [],
    responsibilities: ['審查交付物品質', '通過或退回修改'],
    max_parallel_work: 3, default_tier: 'reasoning', templates: ['fullstack_app', 'research_report', 'full_company'],
  },
  {
    id: 'synthesizer', name: '整合者', level: 4, level_label: '支援角色', category: 'review',
    reporting_to: null, can_delegate_to: ['developer'],
    responsibilities: ['合併工作項產出', '統一最終交付'],
    max_parallel_work: 1, default_tier: 'reasoning',
    templates: ['fullstack_app', 'page_dev', 'research_report', 'full_company'],
  },
  {
    id: 'analyst', name: '分析師', level: 4, level_label: '支援角色', category: 'management',
    reporting_to: null, can_delegate_to: [],
    responsibilities: ['研究與資料收集', '數據驅動建議'],
    max_parallel_work: 3, default_tier: 'routine', templates: ['research_report', 'full_company'],
  },
  {
    id: 'coordinator', name: '協調者', level: 4, level_label: '支援角色', category: 'management',
    reporting_to: null, can_delegate_to: ['manager'],
    responsibilities: ['跨角色溝通', '解除工作項阻塞'],
    max_parallel_work: 4, default_tier: 'routine', templates: ['full_company'],
  },
  {
    id: 'security_lead', name: '資安主管', level: 1, level_label: '技術領導層', category: 'security',
    reporting_to: 'manager', can_delegate_to: ['security_eng', 'legal'],
    responsibilities: ['威脅模型與安全閘', '審查敏感資料流向'],
    max_parallel_work: 3, default_tier: 'reasoning', templates: ['full_company'],
  },
  {
    id: 'product_lead', name: '產品主管', level: 1, level_label: '技術領導層', category: 'product',
    reporting_to: 'manager', can_delegate_to: ['tech_writer', 'content_writer', 'researcher'],
    responsibilities: ['驗收標準與優先序', '對齊商業價值'],
    max_parallel_work: 3, default_tier: 'reasoning', templates: ['full_company'],
  },
  {
    id: 'data_lead', name: '資料主管', level: 2, level_label: '領域領導層', category: 'data',
    reporting_to: 'tech_lead', can_delegate_to: ['data_engineer', 'dba', 'analyst'],
    responsibilities: ['資料資產與指標口徑', '管線品質'],
    max_parallel_work: 3, default_tier: 'reasoning', templates: ['full_company'],
  },
  {
    id: 'mobile_dev', name: '行動開發者', level: 3, level_label: '執行層', category: 'mobile',
    reporting_to: 'frontend_lead', can_delegate_to: [],
    responsibilities: ['行動端介面與導航', '離線與推播'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['full_company'],
  },
  {
    id: 'sre', name: '可靠性工程師', level: 3, level_label: '執行層', category: 'devops',
    reporting_to: 'tech_lead', can_delegate_to: [],
    responsibilities: ['SLO 與告警', '事故與容量'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['full_company'],
  },
  {
    id: 'dba', name: '資料庫管理員', level: 3, level_label: '執行層', category: 'data',
    reporting_to: 'backend_lead', can_delegate_to: [],
    responsibilities: ['schema 與索引', '備份還原'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['full_company'],
  },
  {
    id: 'security_eng', name: '資安工程師', level: 3, level_label: '執行層', category: 'security',
    reporting_to: 'security_lead', can_delegate_to: [],
    responsibilities: ['弱點檢查', '護欄驗證'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['full_company'],
  },
  {
    id: 'data_engineer', name: '資料工程師', level: 3, level_label: '執行層', category: 'data',
    reporting_to: 'data_lead', can_delegate_to: [],
    responsibilities: ['ETL 管線', '資料契約'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['full_company'],
  },
  {
    id: 'tech_writer', name: '技術文件工程師', level: 3, level_label: '執行層', category: 'docs',
    reporting_to: 'product_lead', can_delegate_to: [],
    responsibilities: ['API 與操作手冊', '錯誤碼說明'],
    max_parallel_work: 2, default_tier: 'summary', templates: ['full_company'],
  },
  {
    id: 'researcher', name: '研究員', level: 4, level_label: '支援角色', category: 'research',
    reporting_to: 'product_lead', can_delegate_to: [],
    responsibilities: ['文獻與競品', '假設與實驗'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['research_report', 'full_company'],
  },
  {
    id: 'prompt_engineer', name: 'Prompt 工程師', level: 4, level_label: '支援角色', category: 'ai',
    reporting_to: 'tech_lead', can_delegate_to: [],
    responsibilities: ['系統提示與評估', '模型路由'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['full_company'],
  },
  {
    id: 'legal', name: '合規審查', level: 4, level_label: '支援角色', category: 'legal',
    reporting_to: 'security_lead', can_delegate_to: [],
    responsibilities: ['個資與授權', '出境風險'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['full_company'],
  },
  {
    id: 'content_writer', name: '內容撰寫', level: 4, level_label: '支援角色', category: 'docs',
    reporting_to: 'product_lead', can_delegate_to: [],
    responsibilities: ['對外文案', '報告敘事'],
    max_parallel_work: 2, default_tier: 'summary', templates: ['research_report', 'full_company'],
  },
  {
    id: 'finance_lead', name: '金融主管', level: 1, level_label: '技術領導層', category: 'finance',
    reporting_to: 'manager', can_delegate_to: ['quant_analyst', 'analyst', 'researcher'],
    responsibilities: ['估值方法與風險上限', '審查量化假設'],
    max_parallel_work: 3, default_tier: 'reasoning', templates: ['quant_desk', 'full_company'],
  },
  {
    id: 'industrial_lead', name: '工業主管', level: 1, level_label: '技術領導層', category: 'industrial',
    reporting_to: 'manager', can_delegate_to: ['opc_engineer', 'sre', 'devops'],
    responsibilities: ['OPC 閉環', '寫入護欄與回滾'],
    max_parallel_work: 3, default_tier: 'reasoning', templates: ['industrial_ops', 'full_company'],
  },
  {
    id: 'creative_lead', name: '創意主管', level: 1, level_label: '技術領導層', category: 'creative',
    reporting_to: 'manager', can_delegate_to: ['story_writer', 'content_writer', 'translator'],
    responsibilities: ['敘事基調', '角色聖經'],
    max_parallel_work: 3, default_tier: 'reasoning', templates: ['story_studio', 'full_company'],
  },
  {
    id: 'quant_analyst', name: '量化分析師', level: 3, level_label: '執行層', category: 'finance',
    reporting_to: 'finance_lead', can_delegate_to: [],
    responsibilities: ['StocksX 行情與估值', '風險與情境分析'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['quant_desk', 'full_company'],
  },
  {
    id: 'crawler', name: '爬蟲工程師', level: 3, level_label: '執行層', category: 'crawler',
    reporting_to: 'data_lead', can_delegate_to: [],
    responsibilities: ['LittleCrawler 採集', '去重與重試'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['full_company'],
  },
  {
    id: 'opc_engineer', name: 'OPC 工業工程師', level: 3, level_label: '執行層', category: 'industrial',
    reporting_to: 'industrial_lead', can_delegate_to: [],
    responsibilities: ['標籤診斷', '護欄寫入建議'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['industrial_ops', 'full_company'],
  },
  {
    id: 'story_writer', name: '故事創作者', level: 3, level_label: '執行層', category: 'creative',
    reporting_to: 'creative_lead', can_delegate_to: [],
    responsibilities: ['情節與對白', 'StoryForge 章節'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['story_studio', 'full_company'],
  },
  {
    id: 'ux_researcher', name: 'UX 研究員', level: 3, level_label: '執行層', category: 'product',
    reporting_to: 'product_lead', can_delegate_to: [],
    responsibilities: ['可用性測試', '痛點與假設'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['full_company'],
  },
  {
    id: 'perf_eng', name: '效能工程師', level: 3, level_label: '執行層', category: 'devops',
    reporting_to: 'tech_lead', can_delegate_to: [],
    responsibilities: ['延遲與吞吐', '效能預算'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['full_company'],
  },
  {
    id: 'translator', name: '在地化專員', level: 3, level_label: '執行層', category: 'docs',
    reporting_to: 'creative_lead', can_delegate_to: [],
    responsibilities: ['繁中在地化', '術語表'],
    max_parallel_work: 2, default_tier: 'summary', templates: ['story_studio', 'full_company'],
  },
  {
    id: 'support', name: '支援專員', level: 4, level_label: '支援角色', category: 'product',
    reporting_to: 'product_lead', can_delegate_to: [],
    responsibilities: ['工單與 FAQ', '缺陷／需求分類'],
    max_parallel_work: 3, default_tier: 'summary', templates: ['full_company'],
  },
  {
    id: 'platform_lead', name: '平台主管', level: 1, level_label: '技術領導層', category: 'platform',
    reporting_to: 'manager', can_delegate_to: ['github_ops', 'release_eng', 'hub_operator'],
    responsibilities: ['GitHub 工作流', '發布節奏', 'Hub 值班'],
    max_parallel_work: 3, default_tier: 'reasoning', templates: ['full_company'],
  },
  {
    id: 'github_ops', name: 'GitHub 工程師', level: 3, level_label: '執行層', category: 'platform',
    reporting_to: 'platform_lead', can_delegate_to: [],
    responsibilities: ['PR／Issue', '倉庫同步', '檢查狀態'],
    max_parallel_work: 3, default_tier: 'routine', templates: ['full_company'],
  },
  {
    id: 'release_eng', name: '發布工程師', level: 3, level_label: '執行層', category: 'platform',
    reporting_to: 'platform_lead', can_delegate_to: [],
    responsibilities: ['版本與變更紀錄', '回滾計畫'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['full_company'],
  },
  {
    id: 'hub_operator', name: 'Hub 值班', level: 3, level_label: '執行層', category: 'hub',
    reporting_to: 'platform_lead', can_delegate_to: [],
    responsibilities: ['路由與熔斷', '日預算'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['full_company'],
  },
  {
    id: 'api_engineer', name: 'API 契約工程師', level: 3, level_label: '執行層', category: 'backend',
    reporting_to: 'backend_lead', can_delegate_to: [],
    responsibilities: ['OpenAPI 契約', '錯誤碼與相容性'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['full_company'],
  },
  {
    id: 'observability_eng', name: '可觀測性工程師', level: 3, level_label: '執行層', category: 'devops',
    reporting_to: 'tech_lead', can_delegate_to: [],
    responsibilities: ['Tracing 與告警門檻', '延遲分位'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['full_company'],
  },
  {
    id: 'accessibility_eng', name: '無障礙工程師', level: 3, level_label: '執行層', category: 'ui',
    reporting_to: 'frontend_lead', can_delegate_to: [],
    responsibilities: ['對比與鍵盤', 'WCAG 修復'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['full_company'],
  },
  {
    id: 'product_designer', name: '產品設計師', level: 3, level_label: '執行層', category: 'product',
    reporting_to: 'product_lead', can_delegate_to: [],
    responsibilities: ['旅程與資訊架構', '空／錯誤狀態'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['full_company'],
  },
  {
    id: 'risk_analyst', name: '風險分析師', level: 3, level_label: '執行層', category: 'finance',
    reporting_to: 'finance_lead', can_delegate_to: [],
    responsibilities: ['情境與回撤', '假設挑戰'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['quant_desk', 'full_company'],
  },
  {
    id: 'market_data_eng', name: '行情工程師', level: 3, level_label: '執行層', category: 'finance',
    reporting_to: 'finance_lead', can_delegate_to: [],
    responsibilities: ['StocksX 資料品質', '時效與缺口'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['quant_desk', 'full_company'],
  },
  {
    id: 'narrative_editor', name: '敘事編輯', level: 3, level_label: '執行層', category: 'creative',
    reporting_to: 'creative_lead', can_delegate_to: [],
    responsibilities: ['節奏與角色聖經', '章節退回'],
    max_parallel_work: 2, default_tier: 'reasoning', templates: ['story_studio', 'full_company'],
  },
  {
    id: 'memory_curator', name: '記憶庫策展', level: 4, level_label: '支援角色', category: 'memory',
    reporting_to: 'tech_lead', can_delegate_to: [],
    responsibilities: ['向量去重', '敏感過濾'],
    max_parallel_work: 2, default_tier: 'routine', templates: ['full_company'],
  },
  {
    id: 'knowledge_mgr', name: '知識庫管理員', level: 4, level_label: '支援角色', category: 'memory',
    reporting_to: 'product_lead', can_delegate_to: [],
    responsibilities: ['runbook 與 FAQ', '術語表'],
    max_parallel_work: 2, default_tier: 'summary', templates: ['full_company'],
  },
];

function blankInbox(): Record<string, number> {
  return { planning: 0, ready: 0, executing: 0, in_review: 0, rework: 0, done: 0, blocked: 0 };
}

export const AGENT_FALLBACK_ROSTER: RoleAgent[] = AGENT_SEED.map((seed) => ({
  ...seed,
  direct_reports: AGENT_SEED.filter((other) => other.reporting_to === seed.id).map((other) => other.id),
  status: 'idle',
  inbox: blankInbox(),
  queue: 0,
  executing: 0,
  done: 0,
  blocked: 0,
  cost_usd: 0,
  last_activity_at: null,
  work_items: [],
  events: [],
  active_task_ids: [],
  current_item: null,
  company_tasks: [],
  capacity_used: 0,
  system_prompt: '',
  preferred_model: '',
  daily_budget_usd: 0,
  tools_allowed: [],
  notes: '',
  enabled: true,
  is_custom: false,
  is_builtin: true,
  alert_on_error: true,
  alert_on_budget: true,
  alert_on_sla: true,
  temperature: 0.7,
  max_output_tokens: 4096,
  timeout_ms: 120000,
  routing_strategy: 'quality_first',
  failover_models: [],
  sla_latency_ms: 0,
  max_retries: 3,
  language: 'zh-TW',
  always_require_review: false,
  priority: 3,
  description: '',
  alerts: [],
  budget_remaining_usd: null,
  budget_over: false,
  metrics: blankMetrics(),
}));

