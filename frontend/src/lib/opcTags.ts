/**
 * OPC 標籤名稱正規化 — 監控表格與 catalog 對齊用。
 */
import type { OpcLiveReading, OpcTagCatalog } from '../types';
import { OPC_FALLBACK_READINGS } from './monitorFallbacks';

const KNOWN_OPC_TAGS = new Set([
  'Temperature',
  'Pressure',
  'FlowRate',
  'ValvePosition',
  'MotorSpeed',
  'Level',
  'AlarmStatus',
  'PowerConsumption',
]);

/** 從 tag_name / node_id 還原短標籤名（與 opc_service/client/nodes.py 對齊）。 */
export function normalizeOpcTagKey(
  tagName: string | null | undefined,
  nodeId?: string | null,
): string | null {
  const node = String(nodeId ?? '');
  if (node.includes(';s=')) {
    const suffix = node.split(';s=')[1] ?? '';
    const short = suffix.includes(':') ? (suffix.split(':').pop() ?? suffix) : suffix;
    if (short && KNOWN_OPC_TAGS.has(short)) return short;
  }
  const name = String(tagName ?? '').trim();
  if (!name) return null;
  if (KNOWN_OPC_TAGS.has(name)) return name;
  for (const known of KNOWN_OPC_TAGS) {
    if (name === known || name.endsWith(known) || name.includes(known)) return known;
  }
  return null;
}

function hasReadingValue(value: unknown): boolean {
  if (value == null || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.trim() !== '' && Number.isFinite(Number(value));
  return false;
}

export function indexOpcReadings(readings: OpcLiveReading[]): Map<string, OpcLiveReading> {
  const map = new Map<string, OpcLiveReading>();
  for (const row of readings) {
    const key = normalizeOpcTagKey(row.tag_name, (row as OpcLiveReading & { node_id?: string }).node_id);
    if (!key || !hasReadingValue(row.value)) continue;
    const prev = map.get(key);
    if (!prev || !hasReadingValue(prev.value)) {
      map.set(key, { ...row, tag_name: key });
    }
  }
  return map;
}

export function mergeOpcCatalogReadings(
  catalog: OpcTagCatalog[],
  readings: OpcLiveReading[] | null | undefined,
): Array<{ tag: OpcTagCatalog; reading?: OpcLiveReading }> {
  const liveRows = Array.isArray(readings) ? readings : [];
  const live = indexOpcReadings(liveRows);
  const fallback = indexOpcReadings(OPC_FALLBACK_READINGS);

  // 後端已按 catalog 順序對齊時，直接用 tag_name 索引（避免 node_id 缺失時漏配）
  for (const row of liveRows) {
    const name = String(row.tag_name ?? '').trim();
    if (!name || !KNOWN_OPC_TAGS.has(name) || !hasReadingValue(row.value)) continue;
    if (!live.has(name)) {
      live.set(name, { ...row, tag_name: name });
    }
  }

  return catalog.map((tag) => ({
    tag,
    reading: live.get(tag.name) ?? fallback.get(tag.name),
  }));
}
