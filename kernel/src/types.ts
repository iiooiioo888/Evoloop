// ━━━ kernel/src/types.ts ━━━
// 内核内部类型定义

import type { DomainEvent, EventHandler } from '../../shared/events.js'
import type { LogLevel } from '../../shared/interfaces.js'

/** 事件订阅记录 */
export interface Subscription {
  /** 订阅唯一 ID */
  id: string
  /** 匹配模式，支持通配符："task.*" | "sandbox.>" | "*" */
  pattern: string
  /** 事件处理器 */
  handler: EventHandler
  /** 订阅者模块 ID（"kernel" 表示内核自身） */
  ownerModuleId: string
  /** 优先级，数字越小越先执行（默认 100） */
  priority: number
  /** 可选过滤函数 */
  filter?: (event: DomainEvent) => boolean
}

/** 订阅选项 */
export interface SubscribeOptions {
  priority?: number
  filter?: (event: DomainEvent) => boolean
  ownerModuleId?: string
}

/** 死信记录 —— 处理失败的事件 + 错误信息 */
export interface DeadLetter {
  event: DomainEvent
  subscriptionId: string
  error: Error
  failedAt: number
}

/** 依赖图节点 */
export interface DependencyNode {
  moduleId: string
  /** 该模块依赖的模块 ID 列表（出边） */
  dependsOn: string[]
  /** 依赖该模块的模块 ID 列表（入边） */
  dependents: string[]
}

/** 依赖拓扑图 */
export interface DependencyGraph {
  nodes: Record<string, DependencyNode>
  /** 拓扑排序后的启动顺序 */
  startupOrder: string[]
}

/** 影响分析结果 */
export interface ImpactAnalysis {
  /** 直接依赖它的模块 */
  directDependents: string[]
  /** 间接依赖它的模块 */
  transitiveDependents: string[]
  /** 将一并被禁用的模块（策略为 disable） */
  willDisable: string[]
  /** 将降级的模块（策略为 degrade） */
  willDegrade: string[]
}

/** 启动前检查结果 */
export interface StartCheckResult {
  ready: boolean
  /** 缺失的依赖（未注册或未激活） */
  missing: string[]
  /** 处于降级状态的依赖 */
  degraded: string[]
}

/** 日志记录 */
export interface LogEntry {
  timestamp: number
  moduleId: string
  level: LogLevel
  message: string
  meta?: unknown
}

/** 日志器接口 */
export interface Logger {
  log(moduleId: string, level: LogLevel, message: string, meta?: unknown): void
}

/** 内核配置 */
export interface KernelConfig {
  /** 模块目录路径 */
  modulesDir: string
  /** 配置文件目录 */
  configDir: string
  /** 回放缓冲最大长度 */
  replayBufferSize?: number
  /** 日志级别 */
  logLevel?: LogLevel
}