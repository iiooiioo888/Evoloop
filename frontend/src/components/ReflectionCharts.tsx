/**
 * 反思閉環可視化：四維雷達 + 迭代趨勢線（精簡格線）。
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MultiDimEvaluation } from '../types';

const BLUE = '#007AFF';
const GREEN = '#34C759';

export function ReflectionRadar({
  multiDim,
  height = 220,
}: {
  multiDim?: MultiDimEvaluation | null;
  height?: number;
}) {
  const data = [
    { dim: '準確', value: multiDim?.accuracy?.score ?? 0 },
    { dim: '完整', value: multiDim?.completeness?.score ?? 0 },
    { dim: '清晰', value: multiDim?.clarity?.score ?? 0 },
    { dim: '相關', value: multiDim?.relevance?.score ?? 0 },
  ];
  const overall = multiDim?.overall ?? 0;

  return (
    <div className="apple-card flex h-full min-h-0 flex-col">
      <div className="apple-card__head">
        <h2 className="apple-title">四維評分</h2>
        <span className="apple-data text-[12px] text-[#007AFF]">{overall.toFixed(1)}</span>
      </div>
      <div className="apple-card__body apple-card__body--static apple-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="rgba(255,255,255,0.08)" />
            <PolarAngleAxis dataKey="dim" tick={{ fill: '#AEAEB2', fontSize: 11 }} />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 10]}
              tick={{ fill: '#636366', fontSize: 9 }}
              axisLine={false}
              tickCount={3}
            />
            <Radar
              name="score"
              dataKey="value"
              stroke={BLUE}
              fill={BLUE}
              fillOpacity={0.28}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function IterationTrend({
  history,
  height = 220,
}: {
  history: Array<{ iteration: number; score: number }>;
  height?: number;
}) {
  const data =
    history.length > 0
      ? history
      : [
          { iteration: 0, score: 0 },
          { iteration: 1, score: 0 },
        ];

  return (
    <div className="apple-card flex h-full min-h-0 flex-col">
      <div className="apple-card__head">
        <h2 className="apple-title">迭代趨勢</h2>
        <span className="text-[10px] text-[#8E8E93]">{history.length || 0} 輪</span>
      </div>
      <div className="apple-card__body apple-card__body--static apple-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="iteration"
              tick={{ fill: '#8E8E93', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 10]}
              tick={{ fill: '#636366', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                background: '#2C2C2E',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke={GREEN}
              strokeWidth={2.5}
              dot={{ r: 3, fill: GREEN, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
