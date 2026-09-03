/** LLM 設定彈窗：供應商預設、API Key、模型池鎖定、連線測試。
 * 含記憶庫管理分頁。 */
import { useCallback, useEffect, useState } from 'react';
import { fetchConfig, refreshLlmModels, saveConfig, testConfig, type LlmConfig } from '../api/client';
import MemoryPanel from './MemoryPanel';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const PROVIDERS = [
  {
    value: 'deepseek',
    label: 'DeepSeek',
    apiBase: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
    hint: '只存 DeepSeek API 時，所有 Agent 只能用 DeepSeek 模型（v4-flash / v4-pro / vision-exp）',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter（通用目錄）',
    apiBase: 'https://openrouter.ai/api/v1',
    defaultModel: '',
    hint: '儲存後會爬取 /models，把可用模型寫入配置；已排除 Claude',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    apiBase: '',
    defaultModel: 'gpt-4o',
    hint: '官方端點可留空；會依金鑰爬取可用模型',
  },
  {
    value: 'qwen',
    label: '通義千問 Qwen（百煉 DashScope）',
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    hint: '使用 DashScope API Key；Agent 鎖定 Qwen 模型',
  },
  {
    value: 'moonshot',
    label: 'Moonshot / Kimi',
    apiBase: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2',
    hint: '只配置 Kimi 金鑰時，Agent 不會改打其他廠商',
  },
  {
    value: 'ollama',
    label: 'Ollama（本地）',
    apiBase: 'http://127.0.0.1:11434/v1',
    defaultModel: '',
    hint: '通用相容端點，儲存後爬取本機 /v1/models',
  },
  {
    value: 'custom',
    label: '自訂（OpenAI 相容端點）',
    apiBase: '',
    defaultModel: '',
    hint: 'vLLM / 閘道等：儲存後自動 GET {端點}/models 並鎖定目錄',
  },
] as const;

type ProviderValue = (typeof PROVIDERS)[number]['value'];

function inferProvider(apiBase: string): ProviderValue {
  const b = apiBase.toLowerCase();
  if (b.includes('openrouter')) return 'openrouter';
  if (b.includes('deepseek')) return 'deepseek';
  if (b.includes('dashscope')) return 'qwen';
  if (b.includes('moonshot')) return 'moonshot';
  if (b.includes('11434')) return 'ollama';
  if (apiBase) return 'custom';
  return 'openai';
}

export default function SettingsModal({ open, onClose, onSaved }: SettingsModalProps) {
  const [tab, setTab] = useState<'llm' | 'memory'>('llm');
  const [provider, setProvider] = useState<ProviderValue>('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [model, setModel] = useState('deepseek-v4-flash');
  const [showKey, setShowKey] = useState(false);
  const [currentMasked, setCurrentMasked] = useState('');
  const [pool, setPool] = useState<LlmConfig | null>(null);
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'fail'; text: string }>({
    kind: 'idle',
    text: '',
  });

  const applyPool = useCallback((cfg: LlmConfig) => {
    setPool(cfg);
    setCurrentMasked(cfg.configured ? cfg.api_key : '');
    setApiBase(cfg.api_base ?? '');
    setModel(cfg.model ?? '');
    setProvider(inferProvider(cfg.api_base ?? ''));
  }, []);

  useEffect(() => {
    if (!open) return;
    setStatus({ kind: 'idle', text: '' });
    fetchConfig()
      .then(applyPool)
      .catch(() => setCurrentMasked(''));
  }, [open, applyPool]);

  const selectProvider = useCallback((value: ProviderValue) => {
    setProvider(value);
    const preset = PROVIDERS.find((p) => p.value === value);
    if (preset) {
      setApiBase(preset.apiBase);
      if (preset.defaultModel) setModel(preset.defaultModel);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setStatus({ kind: 'busy', text: '儲存並刷新模型池…' });
    try {
      const payload: { api_key?: string; api_base: string; model: string } = {
        api_base: apiBase,
        model,
      };
      if (apiKey.trim()) payload.api_key = apiKey.trim();
      else if (!currentMasked) payload.api_key = '';
      const cfg = await saveConfig(payload);
      applyPool(cfg);
      setStatus({
        kind: 'ok',
        text: cfg.lock_message || '已儲存，Agent 已鎖定目前 API 可用模型',
      });
      setApiKey('');
      onSaved();
    } catch (err) {
      setStatus({ kind: 'fail', text: (err as Error).message });
    }
  }, [apiKey, apiBase, model, currentMasked, onSaved, applyPool]);

  const handleTest = useCallback(async () => {
    setStatus({ kind: 'busy', text: '測試連線中…' });
    try {
      const result = await testConfig();
      if (result.ok) {
        setStatus({ kind: 'ok', text: `✓ 連線成功（回應：${result.reply}）` });
      } else {
        setStatus({ kind: 'fail', text: `✗ 連線失敗：${result.error}` });
      }
    } catch (err) {
      setStatus({ kind: 'fail', text: (err as Error).message });
    }
  }, []);

  const handleRefreshPool = useCallback(async () => {
    setStatus({ kind: 'busy', text: '爬取 /models…' });
    try {
      const next = await refreshLlmModels();
      setPool((prev) => ({
        ...next,
        api_key: prev?.api_key ?? '',
      }));
      if (next.model) setModel(next.model);
      setStatus({
        kind: next.catalog_error ? 'fail' : 'ok',
        text: next.catalog_error || next.lock_message,
      });
    } catch (err) {
      setStatus({ kind: 'fail', text: (err as Error).message });
    }
  }, []);

  if (!open) return null;

  const preset = PROVIDERS.find((p) => p.value === provider);
  const allowed = pool?.allowed_models ?? [];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl ${
          tab === 'memory' ? 'max-w-2xl' : 'max-w-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('llm')}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                tab === 'llm' ? 'bg-blue-600/20 text-blue-300' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              🔑 LLM 設定
            </button>
            <button
              onClick={() => setTab('memory')}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                tab === 'memory' ? 'bg-blue-600/20 text-blue-300' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              🧠 記憶庫
            </button>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-800"
            aria-label="關閉"
          >
            ✕
          </button>
        </div>

        {tab === 'memory' && (
          <div className="h-[60vh] overflow-hidden rounded-lg border border-gray-800">
            <MemoryPanel />
          </div>
        )}

        {tab === 'llm' && (
        <div>
        <label className="mb-1 block text-xs text-gray-400">供應商</label>
        <select
          value={provider}
          onChange={(e) => selectProvider(e.target.value as ProviderValue)}
          className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {preset && <p className="mb-3 text-[11px] text-gray-500">{preset.hint}</p>}

        <label className="mb-1 block text-xs text-gray-400">
          API Key
          {currentMasked && (
            <span className="ml-2 text-gray-500">（目前已設定：{currentMasked}）</span>
          )}
        </label>
        <div className="mb-3 flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={currentMasked ? '留空保持原金鑰' : 'sk-...'}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            className="shrink-0 rounded-lg border border-gray-700 px-2.5 text-sm text-gray-400 hover:bg-gray-800"
            title={showKey ? '隱藏' : '顯示'}
          >
            {showKey ? '隱藏' : '顯示'}
          </button>
        </div>

        <label className="mb-1 block text-xs text-gray-400">API 端點</label>
        <input
          type="text"
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
          placeholder="https://..."
          className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />

        <label className="mb-1 block text-xs text-gray-400">
          模型（僅能選目前 API 可用池）
        </label>
        <input
          list="evoloop-allowed-models"
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={allowed[0] || 'deepseek-chat'}
          className="mb-2 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <datalist id="evoloop-allowed-models">
          {allowed.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        {pool?.lock_message && (
          <p className="mb-2 text-[11px] text-blue-300/90">{pool.lock_message}</p>
        )}
        {allowed.length > 0 && (
          <p className="mb-3 text-[11px] text-gray-500">
            已載入 {allowed.length} 個模型
            {pool?.catalog_source ? ` · 來源 ${pool.catalog_source}` : ''}
            {pool?.ops?.stale ? ' · 目錄過期' : ''}
          </p>
        )}

        {status.text && (
          <p
            className={`mb-3 text-xs ${
              status.kind === 'ok'
                ? 'text-green-400'
                : status.kind === 'fail'
                  ? 'text-red-400'
                  : 'text-gray-400'
            }`}
          >
            {status.text}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => void handleRefreshPool()}
            disabled={status.kind === 'busy'}
            className="flex-1 rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          >
            爬取目錄
          </button>
          <button
            onClick={() => void handleTest()}
            disabled={status.kind === 'busy'}
            className="flex-1 rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          >
            測試連線
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={status.kind === 'busy'}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            儲存
          </button>
        </div>
        </div>
        )}
      </div>
    </div>
  );
}
