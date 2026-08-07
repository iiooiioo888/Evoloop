/**
 * BillingPanel — 雲端費用儀表盤。
 *
 * 顯示費用摘要卡片（今日/本月/預估）、各服務費用佔比條、
 * 以及按時計費費率表。
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchCloudBilling } from '../api/client';
import type { CloudBilling } from '../types';

function formatCost(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

export default function BillingPanel() {
  const [billing, setBilling] = useState<CloudBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchCloudBilling();
      setBilling(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (loading && !billing) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-gray-500">加載費用數據...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 overflow-auto p-4">
      {/* 費用摘要卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-800 bg-gray-900/80 p-4">
          <p className="text-[11px] uppercase text-gray-500">今日費用</p>
          <p className="mt-1 text-2xl font-bold text-green-300">
            {billing ? formatCost(billing.today_total) : '--'}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-600">實時累計</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/80 p-4">
          <p className="text-[11px] uppercase text-gray-500">本月費用</p>
          <p className="mt-1 text-2xl font-bold text-amber-300">
            {billing ? formatCost(billing.month_total) : '--'}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-600">當月累計</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/80 p-4">
          <p className="text-[11px] uppercase text-gray-500">預估月度</p>
          <p className="mt-1 text-2xl font-bold text-blue-300">
            {billing ? formatCost(billing.month_projected) : '--'}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-600">30 天推算</p>
        </div>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="rounded-lg bg-red-500/15 px-4 py-2 text-sm text-red-300">
          ⚠ {error}
          <button onClick={() => void refresh()} className="ml-3 underline">重試</button>
        </div>
      )}

      {/* 各服務費用明細 */}
      {billing && billing.per_service.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/80">
          <div className="border-b border-gray-800 px-4 py-3">
            <h3 className="text-sm font-medium text-gray-200">各服務費用明細</h3>
          </div>
          <div className="divide-y divide-gray-800">
            {billing.per_service.map((svc) => {
              const maxCost = billing.per_service[0]?.cost ?? 1;
              const pct = maxCost > 0 ? (svc.cost / maxCost) * 100 : 0;
              return (
                <div key={svc.service} className="px-4 py-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-200">
                        {svc.service}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        ${svc.rate.toFixed(3)}/h · {svc.uptime_hours}h
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-amber-300">
                      {formatCost(svc.cost)}
                    </span>
                  </div>
                  {/* 費用佔比條 */}
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {/* 總計行 */}
          <div className="border-t border-gray-800 px-4 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">總計</span>
              <span className="text-sm font-bold text-amber-300">
                {formatCost(billing.total_now)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 無數據提示 */}
      {billing && billing.per_service.length === 0 && (
        <div className="flex flex-col items-center py-12 text-center">
          <span className="mb-2 text-4xl">📊</span>
          <p className="text-sm text-gray-500">暫無容器運行</p>
          <p className="text-xs text-gray-600">啟動 EvoLoop 容器後開始計費</p>
        </div>
      )}
    </div>
  );
}