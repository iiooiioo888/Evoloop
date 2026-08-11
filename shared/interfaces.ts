// ━━━ shared/interfaces.ts ━━━
// 核心类型定义 —— 所有模块的契约

import type { DomainEvent } from './events.js'

/** JSON Schema 简化类型（用于模块配置项定义） */
export type JSONSchema = {
  type?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  description?: string
  default?: unknown
  enum?: unknown[]
  [key: string]: unknown
}

/** 模块状态 */
export type ModuleStatus =
  | 'unregistered' // 未注册
  | 'registered' // 已注册，待初始化
  | 'initializing' // 初始化中
  | 'active' // 正常运行
  | 'degraded' // 降级运行（依赖缺失）
  | 'paused' // 已暂停
  | 'stopped' // 已停止
  | 'error' // 异常

/** 权限定义 */
export interface Permission {
  /** 资源类型: "filesystem" | "network" | "process" | "llm" 等 */
  resource: string
  /** 操作: "read" | "write" | "execute" 等 */
  action: string
  /** 限制范围，如 "/workspace" */
  scope?: string
}

/** 降级策略 —— 依赖不可用时的行为 */
export interface DegradationPolicy {
  whenDependencyUnavailable: 'disable' | 'degrade' | 'queue' | 'ignore'
}

/** 模块清单 —— 每个模块启动时必须提交 */
export interface ModuleManifest {
  /** 唯一标识，如 "sandbox-mgr" */
  id: string
  /** 语义化版本号 */
  version: string
  /** 人类可读名称 */
  name: string
  /** 功能描述 */
  description: string
  /** 能力声明，如 ["create-sandbox", "snapshot"] */
  capabilities: string[]
  /** 依赖的其他模块 ID */
  dependencies: string[]
  /** 需要的权限 */
  permissions: Permission[]
  /** 可配置项定义 */
  configSchema: JSONSchema
  /** 依赖不可用时的降级策略 */
  degradationPolicy: DegradationPolicy
}

/** 内核暴露给模块的最小权限 API */
export interface KernelAPI {
  /** 发布事件 */
  publish(event: {
    type: string
    source: string
    payload: unknown
    correlationId?: string
    causationId?: string
  }): Promise<void>

  /** 订阅事件（支持通配符），返回订阅 ID */
  subscribe(
    pattern: string,
    handler: (event: DomainEvent) => Promise<void>,
    options?: {
      priority?: number
      filter?: (event: DomainEvent) => boolean
      ownerModuleId?: string
    },
  ): string

  /** 取消订阅 */
  unsubscribe(subscriptionId: string): void

  /** 获取模块实例（只读查询） */
  getModule(moduleId: string): Module | undefined

  /** 按能力查找模块 */
  findModulesByCapability(capability: string): Module[]

  /** 权限检查 */
  checkPermission(moduleId: string, permission: Permission): boolean

  /** 读取模块配置 */
  getConfig(moduleId: string): Record<string, unknown>

  /** 日志 */
  log(moduleId: string, level: LogLevel, message: string, meta?: unknown): void
}

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 模块实例 —— 每个模块必须实现 */
export interface Module {
  /** 模块清单 */
  manifest: ModuleManifest

  /** 初始化：注入内核 API 与配置 */
  init(kernel: KernelAPI, config: Record<string, unknown>): Promise<void>

  /** 启动 */
  start(): Promise<void>

  /** 暂停（保留状态，停止处理新事件） */
  pause(): Promise<void>

  /** 恢复 */
  resume(): Promise<void>

  /** 停止 */
  stop(): Promise<void>

  /** 销毁（释放资源） */
  destroy(): Promise<void>

  /** 配置热更新回调 */
  onConfigChange(newConfig: Record<string, unknown>): Promise<void>

  /** 获取当前状态 */
  getStatus(): ModuleStatus
}

/** 模块构造函数 / 默认导出形态 */
export type ModuleFactory = Module | (() => Module)