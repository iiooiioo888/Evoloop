/**
 * 監控中心前端降級目錄（單一資料源）。
 *
 * 由 `python -m backend.scripts.export_monitor_fallback` 從後端
 * role_catalog / hub.catalog / opc_service 生成，禁止在此手動維護角色清單。
 */
import type { HubMonitorModel, OpcLiveReading, OpcTagCatalog, RoleAgent } from '../types';
import { blankMetrics } from './agentUi';
import snapshot from '../generated/monitor-fallback.json';

type MonitorFallbackSnapshot = {
  version: number;
  agents: RoleAgent[];
  hub_models: HubMonitorModel[];
  hub_routing: {
    default_chain: string[];
    cn_chain: string[];
    race_pair: string[];
    forbidden_vendor: string;
  };
  opc_catalog: OpcTagCatalog[];
};

const data = snapshot as MonitorFallbackSnapshot;

export const AGENT_FALLBACK_ROSTER: RoleAgent[] = data.agents.map((agent) => ({
  ...agent,
  metrics: agent.metrics ?? blankMetrics(),
}));

export const HUB_FALLBACK_MODELS: HubMonitorModel[] = data.hub_models;

export const HUB_FALLBACK_ROUTING = data.hub_routing;

export const OPC_FALLBACK_CATALOG: OpcTagCatalog[] = data.opc_catalog;

/** 與 opc_service/simulator/tags.py init 對齊；後端不可達時填充 OPC 表格。 */
const OPC_SIM_INIT: Record<string, number> = {
  Temperature: 25,
  Pressure: 101.3,
  FlowRate: 50,
  ValvePosition: 30,
  MotorSpeed: 1500,
  Level: 60,
  AlarmStatus: 0,
  PowerConsumption: 45,
};

export const OPC_FALLBACK_READINGS: OpcLiveReading[] = OPC_FALLBACK_CATALOG.map((tag) => ({
  tag_name: tag.name,
  value: OPC_SIM_INIT[tag.name] ?? null,
  quality: 'Simulated',
}));
