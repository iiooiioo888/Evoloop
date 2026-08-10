/** LLM 設定彈窗：供應商預設、API Key 輸入、模型與端點配置、連線測試。
 * 含記憶庫管理分頁。 */
import { useCallback, useEffect, useState } from 'react';
import { fetchConfig, saveConfig, testConfig } from '../api/client';
import MemoryPanel from './MemoryPanel';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const PROVIDERS = [
  {
    value: 'openai',
    label: 'OpenAI',
    apiBase: '',
    defaultModel: 'gpt-4o',
    hint: '使用 OPENAI_API_KEY，端點留空即可',
  },
  {
    value: 'qwen',
    label: '通義千問 Qwen（百煉 DashScope）',
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'openai/qwen-plus',
    hint: '使用 DashScope API Key，可選 qwen-turbo / qwen-max',
  },
  {
    value: 'custom',
    label: '自訂（OpenAI 相容端點）',
    apiBase: '',
    defaultModel: '',
    hint: '適用於本地部署（Ollama、vLLM 等）或其他相容服務',
  },
] as const;

type ProviderValue = (typeof PROVIDERS)[number]['value'];

export default function SettingsModal({ open, onClose, onSaved }: SettingsModalProps) {
  const [tab, setTab] = useState<'llm' | 'memory'>('llm');
  const [provider, setProvider] = useState<ProviderValue>('openai');
  const [apiKey, setApiKey] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [showKey, setShowKey] = useState(false);
  const [currentMasked, setCurrentMasked] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'fail'; text: string }>({
    kind: 'idle',
    text: '',
  });

  // 開啟時載入当前配置
  useEffect(() => {
    if (!open) return;
    setStatus({ kind: 'idle', text: '' });
    fetchConfig()
      .then((cfg) => {
        setCurrentMasked(cfg.configured ? cfg.api_key : '');
        setApiBase(cfg.api_base ?? '');
        setModel(cfg.model ?? '');
        // 依端點推斷供應商
        if (cfg.api_base?.includes('dashscope')) setProvider('qwen');
        else if (cfg.api_base) setProvider('custom');
        else setProvider('openai');
      })
      .catch(() => setCurrentMasked(''));
  }, [open]);

  const selectProvider = useCallback((value: ProviderValue) => {
    setProvider(value);
    const preset = PROVIDERS.find((p) => p.value === value);
    if (preset) {
      setApiBase(preset.apiBase);
      if (preset.defaultModel) setModel(preset.defaultModel);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setStatus({ kind: 'busy', text: '儲存中…' });
    try {
      // 金鑰欄位留空且有已存金鑰 → 不覆蓋原金鑰
      const payload: { api_key?: string; api_base: string; model: string } = {
        api_base: apiBase,
        model,
      };
      if (apiKey.trim()) payload.api_key = apiKey.trim();
      else if (!currentMasked) payload.api_key = '';
      await saveConfig(payload);
      setStatus({ kind: 'ok', text: '已儲存，配置即時生效' });
      setApiKey('');
      onSaved();
    } catch (err) {
      setStatus({ kind: 'fail', text: (err as Error).message });
    }
  }, [apiKey, apiBase, model, currentMasked, onSaved]);

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

  if (!open) return null;

  const preset = PROVIDERS.find((p) => p.value === provider);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl ${
          tab === 'memory' ? 'max-w-2xl' : 'max-w-md'
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

        {/* 記憶庫分頁 */}
        {tab === 'memory' && (
          <div className="h-[60vh] overflow-hidden rounded-lg border border-gray-800">
            <MemoryPanel />
          </div>
        )}

        {/* LLM 設定分頁 */}
        {tab === 'llm' && (
        <div>

        {/* 供應商選擇 */}
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

        {/* API Key */}
        <label className="mb-1 block text-xs text-gray-400">
          API Key
          {currentMasked && (
            <span className="ml-2 text-gray-500">（当前已設定：{currentMasked}）</span>
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
            {showKey ? '🙈' : '👁'}
          </button>
        </div>

        {/* API 端點 */}
        <label className="mb-1 block text-xs text-gray-400">
          API 端點（OpenAI 或 Qwen 預設可留空/自動帶入）
        </label>
        <input
          type="text"
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
          placeholder="https://..."
          className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />

        {/* 模型 */}
        <label className="mb-1 block text-xs text-gray-400">模型</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-4o 或 openai/qwen-plus"
          className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />

        {/* 狀態訊息 */}
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

        {/* 按鈕列 */}
        <div className="flex gap-2">
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
