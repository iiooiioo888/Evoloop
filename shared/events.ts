// ━━━ shared/events.ts ━━━
// 全局事件类型枚举与事件结构

/** 领域事件结构 —— 事件总线上传递的标准载体 */
export interface DomainEvent<T = unknown> {
  /** 唯一事件 ID（UUID） */
  id: string
  /** 事件类型，如 "task.created" */
  type: string
  /** 发出者模块 ID */
  source: string
  /** 事件数据 */
  payload: T
  /** 时间戳（毫秒） */
  timestamp: number
  /** 关联到具体任务/请求 */
  correlationId: string
  /** 因果链：由哪个事件触发 */
  causationId?: string
}

/** 事件处理器 */
export type EventHandler = (event: DomainEvent) => Promise<void>

/** 全局事件类型枚举 */
export enum EventType {
  // ── 系统级 ──
  SYSTEM_READY = 'system.ready',
  SYSTEM_SHUTDOWN = 'system.shutdown',

  // ── 模块生命周期 ──
  MODULE_REGISTERED = 'module.registered',
  MODULE_STARTED = 'module.started',
  MODULE_STOPPED = 'module.stopped',
  MODULE_PAUSED = 'module.paused',
  MODULE_RESUMED = 'module.resumed',
  MODULE_ERROR = 'module.error',
  MODULE_CONFIG_CHANGED = 'module.config.changed',

  // ── 任务流 ──
  TASK_CREATED = 'task.created',
  TASK_PLAN_READY = 'task.plan_ready',
  TASK_STEP_STARTED = 'task.step.started',
  TASK_STEP_COMPLETED = 'task.step.completed',
  TASK_STEP_FAILED = 'task.step.failed',
  TASK_BLOCKED = 'task.blocked',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',

  // ── 沙箱 ──
  SANDBOX_CREATE_REQ = 'sandbox.create_requested',
  SANDBOX_READY = 'sandbox.ready',
  SANDBOX_SNAPSHOT = 'sandbox.snapshot',
  SANDBOX_ROLLBACK = 'sandbox.rollback',
  SANDBOX_DESTROYED = 'sandbox.destroyed',
  SANDBOX_ERROR = 'sandbox.error',

  // ── 记忆 ──
  MEMORY_STORE = 'memory.store',
  MEMORY_RECALL = 'memory.recall',
  MEMORY_COMPACTED = 'memory.compacted',

  // ── 人类介入 ──
  INTERVENTION_REQUIRED = 'intervention.required',
  INTERVENTION_RESPONDED = 'intervention.responded',
  INTERVENTION_TIMEOUT = 'intervention.timeout',

  // ── 通知 ──
  NOTIFICATION_SEND = 'notification.send',
  NOTIFICATION_SENT = 'notification.sent',

  // ── 安全 ──
  SECURITY_VIOLATION = 'security.violation',
  SECURITY_BLOCKED = 'security.blocked',
}

/**
 * 事件通配符规则：
 * - "task.created" → 精确匹配
 * - "task.*"       → 匹配 task. 下所有直接事件（单层）
 * - "task.>"       → 匹配 task. 下所有层级事件（含子事件）
 * - "*"            → 匹配所有事件（审计模块用）
 */
export function matchEventPattern(pattern: string, eventType: string): boolean {
  // 精确匹配
  if (pattern === eventType) return true

  // 全局通配符
  if (pattern === '*') return true

  // 多层通配符 "task.>"
  if (pattern.endsWith('.>')) {
    const prefix = pattern.slice(0, -2) // 去掉 ".>"
    return eventType.startsWith(prefix + '.')
  }

  // 单层通配符 "task.*"
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2) // 去掉 ".*"
    if (!eventType.startsWith(prefix + '.')) return false
    // 确保只有一层：剩余部分不含 "."
    const rest = eventType.slice(prefix.length + 1)
    return !rest.includes('.')
  }

  return false
}