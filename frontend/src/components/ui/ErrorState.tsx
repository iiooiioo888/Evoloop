/**
 * 統一錯誤／異常狀態（Apple 風格：柔和紅點 + 清楚動作）。
 */
import type { ReactNode } from 'react';

export type ErrorKind = 'opc_guard' | 'llm' | 'network' | 'partial' | 'generic';

const TONE: Record<ErrorKind, { title: string; color: string }> = {
  opc_guard: { title: 'OPC 護欄', color: '#FF9500' },
  llm: { title: '模型失敗', color: '#FF3B30' },
  network: { title: '連線異常', color: '#FF3B30' },
  partial: { title: '部分來源', color: '#FF9500' },
  generic: { title: '錯誤', color: '#FF3B30' },
};

export default function ErrorState({
  kind = 'generic',
  message,
  detail,
  onRetry,
  onDismiss,
  compact,
}: {
  kind?: ErrorKind;
  message: string;
  detail?: ReactNode;
  onRetry?: () => void;
  onDismiss?: () => void;
  compact?: boolean;
}) {
  const tone = TONE[kind];
  return (
    <div
      role="alert"
      className={`rounded-2xl border px-4 ${compact ? 'py-2.5' : 'py-3.5'} ${
        kind === 'opc_guard' || kind === 'partial'
          ? 'border-[#FF9500]/28 bg-[#FF9500]/10'
          : 'border-[#FF3B30]/28 bg-[#FF3B30]/10'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className="apple-dot mt-1.5 shrink-0"
          style={{
            background: tone.color,
            boxShadow: `0 0 0 2px ${tone.color}33, 0 0 12px ${tone.color}55`,
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: tone.color }}>
            {tone.title}
          </p>
          <p className="mt-1 text-[13px] font-normal leading-snug text-[#F5F5F7]">{message}</p>
          {detail && <div className="mt-2 text-[11px] text-[#AEAEB2]">{detail}</div>}
          {(onRetry || onDismiss) && (
            <div className="mt-3 flex gap-2">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-full bg-[#007AFF] px-3 py-1 text-[11px] font-bold text-white"
                >
                  重試
                </button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-[#AEAEB2]"
                >
                  關閉
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
