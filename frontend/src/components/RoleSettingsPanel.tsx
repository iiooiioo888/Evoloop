/**
 * 角色設定表單：內建覆蓋 + 自定義角色建立／刪除／複製。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AgentCatalogMeta, RoleAgent, RolePreset } from '../types';
import { CATEGORY_LABEL, ROUTING_LABEL, TIER_LABEL } from '../lib/agentUi';

export interface RoleSettingsDraft {
  name: string;
  enabled: boolean;
  system_prompt: string;
  responsibilitiesText: string;
  default_tier: string;
  max_parallel_work: number;
  preferred_model: string;
  daily_budget_usd: number;
  toolsText: string;
  notes: string;
  reporting_to: string;
  can_delegate_to: string;
  alert_on_error: boolean;
  alert_on_budget: boolean;
  alert_on_sla: boolean;
  level: number;
  category: string;
  temperature: number;
  max_output_tokens: number;
  timeout_ms: number;
  routing_strategy: string;
  failoverText: string;
  sla_latency_ms: number;
  max_retries: number;
  language: string;
  always_require_review: boolean;
  priority: number;
  description: string;
  weekly_budget_usd: number;
  monthly_budget_usd: number;
  max_daily_items: number;
  require_human_approval: boolean;
  stream_enabled: boolean;
  cache_enabled: boolean;
  pii_redact: boolean;
  mainland_only: boolean;
  heartbeat_sec: number;
  on_call: boolean;
  tagsText: string;
  notify_channel: string;
  quiet_hours: string;
  context_window: number;
  allow_tool_use: boolean;
  auto_escalate: boolean;
}

export function draftFromAgent(agent: RoleAgent): RoleSettingsDraft {
  return {
    name: agent.name,
    enabled: agent.enabled !== false,
    system_prompt: agent.system_prompt ?? '',
    responsibilitiesText: (agent.responsibilities ?? []).join('\n'),
    default_tier: agent.default_tier || 'routine',
    max_parallel_work: agent.max_parallel_work || 2,
    preferred_model: agent.preferred_model ?? '',
    daily_budget_usd: agent.daily_budget_usd ?? 0,
    toolsText: (agent.tools_allowed ?? []).join(', '),
    notes: agent.notes ?? '',
    reporting_to: agent.reporting_to ?? '',
    can_delegate_to: (agent.can_delegate_to ?? []).join(', '),
    alert_on_error: agent.alert_on_error !== false,
    alert_on_budget: agent.alert_on_budget !== false,
    alert_on_sla: agent.alert_on_sla !== false,
    level: agent.level,
    category: agent.category || 'management',
    temperature: agent.temperature ?? 0.7,
    max_output_tokens: agent.max_output_tokens ?? 4096,
    timeout_ms: agent.timeout_ms ?? 120000,
    routing_strategy: agent.routing_strategy || 'quality_first',
    failoverText: (agent.failover_models ?? []).join(', '),
    sla_latency_ms: agent.sla_latency_ms ?? 0,
    max_retries: agent.max_retries ?? 3,
    language: agent.language || 'zh-TW',
    always_require_review: agent.always_require_review === true,
    priority: agent.priority ?? 3,
    description: agent.description ?? '',
    weekly_budget_usd: agent.weekly_budget_usd ?? 0,
    monthly_budget_usd: agent.monthly_budget_usd ?? 0,
    max_daily_items: agent.max_daily_items ?? 0,
    require_human_approval: agent.require_human_approval === true,
    stream_enabled: agent.stream_enabled !== false,
    cache_enabled: agent.cache_enabled !== false,
    pii_redact: agent.pii_redact !== false,
    mainland_only: agent.mainland_only === true,
    heartbeat_sec: agent.heartbeat_sec ?? 0,
    on_call: agent.on_call === true,
    tagsText: (agent.tags ?? []).join(', '),
    notify_channel: agent.notify_channel ?? '',
    quiet_hours: agent.quiet_hours ?? '',
    context_window: agent.context_window ?? 0,
    allow_tool_use: agent.allow_tool_use !== false,
    auto_escalate: agent.auto_escalate !== false,
  };
}

export function draftToPayload(draft: RoleSettingsDraft): Record<string, unknown> {
  return {
    name: draft.name,
    enabled: draft.enabled,
    system_prompt: draft.system_prompt,
    responsibilities: draft.responsibilitiesText.split('\n').map((s) => s.trim()).filter(Boolean),
    default_tier: draft.default_tier,
    max_parallel_work: draft.max_parallel_work,
    preferred_model: draft.preferred_model,
    daily_budget_usd: draft.daily_budget_usd,
    tools_allowed: draft.toolsText.split(',').map((s) => s.trim()).filter(Boolean),
    notes: draft.notes,
    reporting_to: draft.reporting_to || null,
    can_delegate_to: draft.can_delegate_to.split(',').map((s) => s.trim()).filter(Boolean),
    alert_on_error: draft.alert_on_error,
    alert_on_budget: draft.alert_on_budget,
    alert_on_sla: draft.alert_on_sla,
    level: draft.level,
    category: draft.category,
    temperature: draft.temperature,
    max_output_tokens: draft.max_output_tokens,
    timeout_ms: draft.timeout_ms,
    routing_strategy: draft.routing_strategy,
    failover_models: draft.failoverText.split(',').map((s) => s.trim()).filter(Boolean),
    sla_latency_ms: draft.sla_latency_ms,
    max_retries: draft.max_retries,
    language: draft.language,
    always_require_review: draft.always_require_review,
    priority: draft.priority,
    description: draft.description,
    weekly_budget_usd: draft.weekly_budget_usd,
    monthly_budget_usd: draft.monthly_budget_usd,
    max_daily_items: draft.max_daily_items,
    require_human_approval: draft.require_human_approval,
    stream_enabled: draft.stream_enabled,
    cache_enabled: draft.cache_enabled,
    pii_redact: draft.pii_redact,
    mainland_only: draft.mainland_only,
    heartbeat_sec: draft.heartbeat_sec,
    on_call: draft.on_call,
    tags: draft.tagsText.split(',').map((s) => s.trim()).filter(Boolean),
    notify_channel: draft.notify_channel,
    quiet_hours: draft.quiet_hours,
    context_window: draft.context_window,
    allow_tool_use: draft.allow_tool_use,
    auto_escalate: draft.auto_escalate,
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#62666d]">{label}</span>
      {hint && <span className="ml-2 text-[10px] text-[#8a8f98]">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  'w-full rounded-md border border-[#23252a] bg-[#0f1011] px-2 py-1.5 text-[12px] text-[#f7f8f8] outline-none focus:border-[#5e6ad2]/60';

interface RoleSettingsPanelProps {
  agent: RoleAgent;
  catalog: AgentCatalogMeta | undefined;
  agents: RoleAgent[];
  saving: boolean;
  error: string | null;
  onSave: (draft: RoleSettingsDraft) => Promise<void>;
  onReset?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onClone?: (agent: RoleAgent) => void;
}

export default function RoleSettingsPanel({
  agent,
  catalog,
  agents,
  saving,
  error,
  onSave,
  onReset,
  onDelete,
  onClone,
}: RoleSettingsPanelProps) {
  const [draft, setDraft] = useState<RoleSettingsDraft>(() => draftFromAgent(agent));
  const [section, setSection] = useState<'identity' | 'model' | 'prompt' | 'alerts' | 'runtime'>('identity');

  useEffect(() => {
    setDraft(draftFromAgent(agent));
  }, [agent]);

  const categories = catalog?.categories ?? Object.entries(CATEGORY_LABEL).map(([id, label]) => ({ id, label }));
  const tiers = catalog?.tiers ?? Object.entries(TIER_LABEL).map(([id, label]) => ({ id, label }));
  const levels = catalog?.levels ?? [];
  const tools = catalog?.tool_names ?? [];
  const routing = catalog?.routing_strategies ?? Object.entries(ROUTING_LABEL).map(([id, label]) => ({ id, label }));

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(draftFromAgent(agent)), [agent, draft]);

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">{error}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[#8a8f98]">
          {agent.is_custom ? '自定義角色 · 可刪除' : '內建角色 · 可覆蓋設定，還原後回到 STANDARD_ROLES'}
        </p>
        <div className="flex flex-wrap gap-1">
          {onClone && (
            <button
              type="button"
              onClick={() => onClone(agent)}
              className="rounded border border-[#23252a] px-2 py-1 text-[11px] text-[#8a8f98] hover:text-[#f7f8f8]"
            >
              複製為自定義
            </button>
          )}
          {onReset && !agent.is_custom && (
            <button
              type="button"
              onClick={() => void onReset()}
              className="rounded border border-[#23252a] px-2 py-1 text-[11px] text-[#8a8f98] hover:text-[#f7f8f8]"
            >
              還原預設
            </button>
          )}
          {onDelete && agent.is_custom && (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="rounded border border-red-500/30 px-2 py-1 text-[11px] text-red-300"
            >
              刪除角色
            </button>
          )}
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={() => void onSave(draft)}
            className="rounded border border-[#5e6ad2]/40 bg-[#5e6ad2]/15 px-2 py-1 text-[11px] text-[#828fff] disabled:opacity-40"
          >
            {saving ? '儲存中…' : '儲存設定'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ['identity', '身分／組織'],
            ['model', '模型／路由'],
            ['prompt', '角色設定'],
            ['runtime', '執行／合規'],
            ['alerts', '預算／告警／監控'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`rounded px-2 py-1 text-[11px] ${
              section === key ? 'bg-[#5e6ad2]/20 text-[#828fff]' : 'text-[#8a8f98]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'identity' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="顯示名稱">
            <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="啟用">
            <button
              type="button"
              onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
              className={`rounded-md border px-3 py-1.5 text-[12px] ${
                draft.enabled
                  ? 'border-[#4cc38a]/40 bg-[#4cc38a]/10 text-[#4cc38a]'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}
            >
              {draft.enabled ? '已啟用 · 可被指派' : '已停用 · 分解時排除'}
            </button>
          </Field>
          <Field label="層級">
            <select
              className={inputCls}
              value={draft.level}
              onChange={(e) => setDraft({ ...draft, level: Number(e.target.value) })}
            >
              {levels.map((lv) => (
                <option key={lv.level} value={lv.level}>
                  L{lv.level} {lv.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="分類">
            <select
              className={inputCls}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="匯報對象">
            <select
              className={inputCls}
              value={draft.reporting_to}
              onChange={(e) => setDraft({ ...draft, reporting_to: e.target.value })}
            >
              <option value="">無上級</option>
              {agents
                .filter((a) => a.id !== agent.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="可委派" hint="逗號分隔 id">
            <input
              className={inputCls}
              value={draft.can_delegate_to}
              onChange={(e) => setDraft({ ...draft, can_delegate_to: e.target.value })}
            />
          </Field>
          <Field label="並行上限">
            <input
              type="number"
              min={1}
              max={16}
              className={inputCls}
              value={draft.max_parallel_work}
              onChange={(e) => setDraft({ ...draft, max_parallel_work: Number(e.target.value) || 1 })}
            />
          </Field>
          <Field label="優先級" hint="1=最高 5=最低">
            <input
              type="number"
              min={1}
              max={5}
              className={inputCls}
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 3 })}
            />
          </Field>
          <Field label="輸出語言">
            <select
              className={inputCls}
              value={draft.language}
              onChange={(e) => setDraft({ ...draft, language: e.target.value })}
            >
              <option value="zh-TW">繁體中文</option>
              <option value="zh-CN">簡體中文</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="允許工具" hint={tools.length ? tools.join(' · ') : '逗號分隔'}>
            <input
              className={inputCls}
              value={draft.toolsText}
              onChange={(e) => setDraft({ ...draft, toolsText: e.target.value })}
            />
          </Field>
          <Field label="一句話職責" hint="目錄卡片摘要">
            <input
              className={inputCls}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </Field>
        </div>
      )}

      {section === 'model' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="模型層級">
            <select
              className={inputCls}
              value={draft.default_tier}
              onChange={(e) => setDraft({ ...draft, default_tier: e.target.value })}
            >
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="指定模型" hint="空白=目前 API 預設；只能填可用池">
            <input
              className={inputCls}
              list="role-allowed-models"
              placeholder={catalog?.allowed_models?.[0] || 'deepseek-chat'}
              value={draft.preferred_model}
              onChange={(e) => setDraft({ ...draft, preferred_model: e.target.value })}
            />
            <datalist id="role-allowed-models">
              {(catalog?.allowed_models ?? []).map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          </Field>
          <Field label="路由策略">
            <select
              className={inputCls}
              value={draft.routing_strategy}
              onChange={(e) => setDraft({ ...draft, routing_strategy: e.target.value })}
            >
              {routing.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="故障轉移模型" hint="逗號分隔，主模型失敗後依序切換">
            <input
              className={inputCls}
              placeholder="gemini-3.1-pro, deepseek-v4-flash"
              value={draft.failoverText}
              onChange={(e) => setDraft({ ...draft, failoverText: e.target.value })}
            />
          </Field>
          <Field label="溫度" hint="0=確定, 2=發散">
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              className={inputCls}
              value={draft.temperature}
              onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
            />
          </Field>
          <Field label="最大輸出 Token">
            <input
              type="number"
              min={256}
              max={128000}
              className={inputCls}
              value={draft.max_output_tokens}
              onChange={(e) => setDraft({ ...draft, max_output_tokens: Number(e.target.value) || 4096 })}
            />
          </Field>
          <Field label="逾時毫秒">
            <input
              type="number"
              min={5000}
              max={600000}
              className={inputCls}
              value={draft.timeout_ms}
              onChange={(e) => setDraft({ ...draft, timeout_ms: Number(e.target.value) || 120000 })}
            />
          </Field>
          <Field label="最大重試">
            <input
              type="number"
              min={0}
              max={8}
              className={inputCls}
              value={draft.max_retries}
              onChange={(e) => setDraft({ ...draft, max_retries: Number(e.target.value) || 0 })}
            />
          </Field>
        </div>
      )}

      {section === 'prompt' && (
        <div className="space-y-3">
          <Field label="系統提示詞（角色設定）">
            <textarea
              rows={10}
              className={`${inputCls} font-mono leading-relaxed`}
              value={draft.system_prompt}
              onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
            />
          </Field>
          <Field label="職責" hint="一行一項">
            <textarea
              rows={6}
              className={inputCls}
              value={draft.responsibilitiesText}
              onChange={(e) => setDraft({ ...draft, responsibilitiesText: e.target.value })}
            />
          </Field>
          <Field label="備註">
            <textarea
              rows={2}
              className={inputCls}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </Field>
        </div>
      )}

      {section === 'runtime' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="標籤" hint="逗號分隔">
            <input className={inputCls} value={draft.tagsText} onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })} />
          </Field>
          <Field label="通知頻道">
            <input className={inputCls} placeholder="slack:#ops / email" value={draft.notify_channel} onChange={(e) => setDraft({ ...draft, notify_channel: e.target.value })} />
          </Field>
          <Field label="安靜時段" hint="例 22:00-08:00">
            <input className={inputCls} value={draft.quiet_hours} onChange={(e) => setDraft({ ...draft, quiet_hours: e.target.value })} />
          </Field>
          <Field label="心跳秒數" hint="0=關閉">
            <input type="number" min={0} className={inputCls} value={draft.heartbeat_sec} onChange={(e) => setDraft({ ...draft, heartbeat_sec: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="上下文視窗" hint="0=模型預設">
            <input type="number" min={0} className={inputCls} value={draft.context_window} onChange={(e) => setDraft({ ...draft, context_window: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="每日工作項上限" hint="0=不限">
            <input type="number" min={0} className={inputCls} value={draft.max_daily_items} onChange={(e) => setDraft({ ...draft, max_daily_items: Number(e.target.value) || 0 })} />
          </Field>
          <div className="flex flex-wrap gap-3 md:col-span-2">
            {[
              ['on_call', '值班中', draft.on_call],
              ['require_human_approval', '人工核准後才執行', draft.require_human_approval],
              ['stream_enabled', '允許串流', draft.stream_enabled],
              ['cache_enabled', '語義快取', draft.cache_enabled],
              ['pii_redact', '個資遮蔽', draft.pii_redact],
              ['mainland_only', '僅國內模型', draft.mainland_only],
              ['allow_tool_use', '允許工具', draft.allow_tool_use],
              ['auto_escalate', '失敗自動升級', draft.auto_escalate],
            ].map(([key, label, checked]) => (
              <label key={String(key)} className="flex items-center gap-2 text-[12px] text-[#d0d6e0]">
                <input
                  type="checkbox"
                  checked={Boolean(checked)}
                  onChange={(e) => setDraft({ ...draft, [key as string]: e.target.checked })}
                />
                {label as string}
              </label>
            ))}
          </div>
        </div>
      )}

      {section === 'alerts' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="每日預算 USD" hint="0=不限">
            <input
              type="number"
              min={0}
              step={0.1}
              className={inputCls}
              value={draft.daily_budget_usd}
              onChange={(e) => setDraft({ ...draft, daily_budget_usd: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="週預算 USD" hint="0=不限">
            <input
              type="number"
              min={0}
              step={0.1}
              className={inputCls}
              value={draft.weekly_budget_usd}
              onChange={(e) => setDraft({ ...draft, weekly_budget_usd: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="月預算 USD" hint="0=不限">
            <input
              type="number"
              min={0}
              step={0.1}
              className={inputCls}
              value={draft.monthly_budget_usd}
              onChange={(e) => setDraft({ ...draft, monthly_budget_usd: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="SLA 延遲 ms" hint="0=不檢查">
            <input
              type="number"
              min={0}
              className={inputCls}
              value={draft.sla_latency_ms}
              onChange={(e) => setDraft({ ...draft, sla_latency_ms: Number(e.target.value) || 0 })}
            />
          </Field>
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <label className="flex items-center gap-2 text-[12px] text-[#d0d6e0]">
              <input
                type="checkbox"
                checked={draft.alert_on_error}
                onChange={(e) => setDraft({ ...draft, alert_on_error: e.target.checked })}
              />
              錯誤時告警
            </label>
            <label className="flex items-center gap-2 text-[12px] text-[#d0d6e0]">
              <input
                type="checkbox"
                checked={draft.alert_on_budget}
                onChange={(e) => setDraft({ ...draft, alert_on_budget: e.target.checked })}
              />
              預算告警
            </label>
            <label className="flex items-center gap-2 text-[12px] text-[#d0d6e0]">
              <input
                type="checkbox"
                checked={draft.alert_on_sla}
                onChange={(e) => setDraft({ ...draft, alert_on_sla: e.target.checked })}
              />
              SLA 逾時告警
            </label>
            <label className="flex items-center gap-2 text-[12px] text-[#d0d6e0]">
              <input
                type="checkbox"
                checked={draft.always_require_review}
                onChange={(e) => setDraft({ ...draft, always_require_review: e.target.checked })}
              />
              產出一律送審查
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

interface CreateRoleModalProps {
  catalog: AgentCatalogMeta | undefined;
  agents: RoleAgent[];
  cloneFrom?: RoleAgent | null;
  onClose: () => void;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
}

export function CreateRoleModal({ catalog, agents, cloneFrom, onClose, onCreate }: CreateRoleModalProps) {
  const presets = catalog?.role_presets ?? [];
  const [id, setId] = useState(cloneFrom ? `copy_${cloneFrom.id}` : '');
  const [name, setName] = useState(cloneFrom ? `${cloneFrom.name}（副本）` : '');
  const [level, setLevel] = useState(cloneFrom?.level ?? 3);
  const [category, setCategory] = useState(cloneFrom?.category || 'management');
  const [prompt, setPrompt] = useState(cloneFrom?.system_prompt ?? '');
  const [responsibilities, setResponsibilities] = useState((cloneFrom?.responsibilities ?? []).join('\n'));
  const [reportingTo, setReportingTo] = useState(cloneFrom?.reporting_to ?? '');
  const [tier, setTier] = useState(cloneFrom?.default_tier || 'routine');
  const [description, setDescription] = useState(cloneFrom?.description ?? '');
  const [model, setModel] = useState(cloneFrom?.preferred_model ?? '');
  const [budget, setBudget] = useState(cloneFrom?.daily_budget_usd ?? 0);
  const [routing, setRouting] = useState(cloneFrom?.routing_strategy || 'quality_first');
  const [parallel, setParallel] = useState(cloneFrom?.max_parallel_work ?? 2);
  const [language, setLanguage] = useState(cloneFrom?.language || 'zh-TW');
  const [priority, setPriority] = useState(cloneFrom?.priority ?? 3);
  const [requireReview, setRequireReview] = useState(cloneFrom?.always_require_review === true);
  const [onCall, setOnCall] = useState(cloneFrom?.on_call === true);
  const [mainlandOnly, setMainlandOnly] = useState(cloneFrom?.mainland_only === true);
  const [humanApproval, setHumanApproval] = useState(cloneFrom?.require_human_approval === true);
  const [tags, setTags] = useState((cloneFrom?.tags ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(cloneFrom?.id ?? '');

  const applyPreset = (preset: RolePreset) => {
    setPresetId(preset.id);
    setName(preset.name);
    setId(preset.id);
    setLevel(preset.level);
    setCategory(preset.category);
    setPrompt(preset.system_prompt);
    setResponsibilities((preset.responsibilities ?? []).join('\n'));
    setReportingTo(preset.reporting_to ?? '');
    setTier(preset.default_tier);
    setDescription(preset.hint ?? '');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#23252a] bg-[#0f1011] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{cloneFrom ? `複製「${cloneFrom.name}」` : '新增自定義角色'}</h3>
          <button type="button" className="text-[12px] text-[#8a8f98]" onClick={onClose}>
            關閉
          </button>
        </div>
        {error && <p className="mb-2 text-[12px] text-red-300">{error}</p>}
        {presets.length > 0 && !cloneFrom && (
          <div className="mb-3">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-[#62666d]">快速模板</p>
            <div className="flex flex-wrap gap-1">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.hint}
                  onClick={() => applyPreset(p)}
                  className={`rounded border px-2 py-1 text-[11px] ${
                    presetId === p.id
                      ? 'border-[#5e6ad2]/40 bg-[#5e6ad2]/15 text-[#828fff]'
                      : 'border-[#23252a] text-[#8a8f98]'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <input className={inputCls} placeholder="顯示名稱（如 量化交易員）" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={inputCls} placeholder="id 建議英文（自動加 custom_ 前綴）" value={id} onChange={(e) => setId(e.target.value)} />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <select className={inputCls} value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {(catalog?.levels ?? []).map((lv) => (
                <option key={lv.level} value={lv.level}>
                  L{lv.level} {lv.label}
                </option>
              ))}
            </select>
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {(catalog?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select className={inputCls} value={tier} onChange={(e) => setTier(e.target.value)}>
              {(catalog?.tiers ?? Object.entries(TIER_LABEL).map(([tid, label]) => ({ id: tid, label }))).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <select className={inputCls} value={reportingTo} onChange={(e) => setReportingTo(e.target.value)}>
              <option value="">無上級</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className={inputCls}
            rows={5}
            placeholder="系統提示詞（角色設定）"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <textarea
            className={inputCls}
            rows={3}
            placeholder="職責，一行一項"
            value={responsibilities}
            onChange={(e) => setResponsibilities(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="一句話職責（目錄摘要）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <input
              className={inputCls}
              placeholder="指定模型（可空）"
              list="create-allowed-models"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <datalist id="create-allowed-models">
              {(catalog?.allowed_models ?? []).map((mid) => (
                <option key={mid} value={mid} />
              ))}
            </datalist>
            <select className={inputCls} value={routing} onChange={(e) => setRouting(e.target.value)}>
              {(catalog?.routing_strategies ?? [{ id: 'quality_first', label: '品質優先' }]).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              type="number"
              min={0}
              step={0.1}
              placeholder="日預算 USD"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value) || 0)}
            />
            <input
              className={inputCls}
              type="number"
              min={1}
              max={16}
              placeholder="並行"
              value={parallel}
              onChange={(e) => setParallel(Number(e.target.value) || 2)}
            />
            <select className={inputCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="zh-TW">繁中</option>
              <option value="zh-CN">簡中</option>
              <option value="en">English</option>
            </select>
            <input
              className={inputCls}
              type="number"
              min={1}
              max={5}
              placeholder="優先級"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 3)}
            />
            <label className="flex items-center gap-2 text-[11px] text-[#d0d6e0]">
              <input type="checkbox" checked={requireReview} onChange={(e) => setRequireReview(e.target.checked)} />
              一律送審查
            </label>
            <label className="flex items-center gap-2 text-[11px] text-[#d0d6e0]">
              <input type="checkbox" checked={onCall} onChange={(e) => setOnCall(e.target.checked)} />
              值班
            </label>
            <label className="flex items-center gap-2 text-[11px] text-[#d0d6e0]">
              <input type="checkbox" checked={humanApproval} onChange={(e) => setHumanApproval(e.target.checked)} />
              需人工核准
            </label>
            <label className="flex items-center gap-2 text-[11px] text-[#d0d6e0]">
              <input type="checkbox" checked={mainlandOnly} onChange={(e) => setMainlandOnly(e.target.checked)} />
              僅國內模型
            </label>
          </div>
          <input className={inputCls} placeholder="標籤，逗號分隔" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="rounded border border-[#23252a] px-3 py-1.5 text-[12px] text-[#8a8f98]" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            className="rounded border border-[#5e6ad2]/40 bg-[#5e6ad2]/15 px-3 py-1.5 text-[12px] text-[#828fff] disabled:opacity-40"
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onCreate({
                  id: id.trim() || name.trim(),
                  name: name.trim(),
                  level,
                  category,
                  default_tier: tier,
                  system_prompt: prompt,
                  responsibilities: responsibilities.split('\n').map((s) => s.trim()).filter(Boolean),
                  reporting_to: reportingTo || agents.find((a) => a.level < level)?.id || 'manager',
                  clone_from: cloneFrom?.id,
                  description,
                  preferred_model: model,
                  daily_budget_usd: budget,
                  routing_strategy: routing,
                  max_parallel_work: parallel,
                  language,
                  priority,
                  always_require_review: requireReview,
                  on_call: onCall,
                  require_human_approval: humanApproval,
                  mainland_only: mainlandOnly,
                  tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
                });
                onClose();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? '建立中…' : cloneFrom ? '建立副本' : '建立'}
          </button>
        </div>
      </div>
    </div>
  );
}
