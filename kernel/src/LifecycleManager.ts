// ━━━ kernel/src/LifecycleManager.ts ━━━
// 生命周期管理器 —— 模块状态机的执行者

import {
  HasDependentsError,
  InvalidModuleStateError,
  ModuleNotFoundError,
} from '../../shared/errors.js'
import { EventType } from '../../shared/events.js'
import type { KernelAPI } from '../../shared/interfaces.js'
import type { DependencyResolver } from './DependencyResolver.js'
import type { EventBus } from './EventBus.js'
import type { Logger, StartCheckResult } from './types.js'
import type { ModuleRegistry } from './ModuleRegistry.js'

export interface LifecycleManagerOptions {
  registry: ModuleRegistry
  eventBus: EventBus
  depResolver: DependencyResolver
  /** 提供给模块的 KernelAPI（init 时注入） */
  kernelAPI: KernelAPI
  /** 读取模块配置的回调 */
  loadConfig: (moduleId: string) => Record<string, unknown>
  logger?: Logger
}

/** 可启动状态 */
const STARTABLE_STATES = new Set(['registered', 'stopped', 'degraded'])
/** 可停止状态 */
const STOPPABLE_STATES = new Set(['active', 'degraded', 'paused', 'error'])

/**
 * 生命周期管理器
 *
 * 模块状态机：
 * unregistered → registered → initializing → active ⇄ paused
 *                                                 ↓
 *                                             degraded → stopped → (可再次 start)
 *                                             error
 */
export class LifecycleManager {
  private readonly registry: ModuleRegistry
  private readonly eventBus: EventBus
  private readonly depResolver: DependencyResolver
  private readonly kernelAPI: KernelAPI
  private readonly loadConfig: (moduleId: string) => Record<string, unknown>
  private readonly logger?: Logger

  constructor(options: LifecycleManagerOptions) {
    this.registry = options.registry
    this.eventBus = options.eventBus
    this.depResolver = options.depResolver
    this.kernelAPI = options.kernelAPI
    this.loadConfig = options.loadConfig
    this.logger = options.logger
  }

  /**
   * 启动单个模块
   *
   * 流程：依赖检查 → initializing → init() → start() → active → 发布事件
   */
  async startModule(moduleId: string): Promise<void> {
    const module = this.registry.get(moduleId)
    if (!module) throw new ModuleNotFoundError(moduleId)

    const currentState = module.getStatus()
    if (currentState === 'active') return // 幂等
    if (!STARTABLE_STATES.has(currentState)) {
      throw new InvalidModuleStateError(moduleId, currentState, 'start')
    }

    // 1. 依赖检查
    const check: StartCheckResult = this.depResolver.canStart(moduleId)
    if (!check.ready) {
      // 根据降级策略决定行为
      const policy = module.manifest.degradationPolicy.whenDependencyUnavailable
      if (policy === 'disable') {
        this.logger?.log('kernel.lifecycle', 'warn', `Module "${moduleId}" disabled: missing deps`, {
          missing: check.missing,
        })
        return
      }
      if (policy !== 'degrade' && policy !== 'ignore' && policy !== 'queue') {
        throw new InvalidModuleStateError(moduleId, currentState, `start (missing deps: ${check.missing.join(',')})`)
      }
    }

    // 2. initializing
    try {
      const config = this.loadConfig(moduleId)
      await module.init(this.kernelAPI, config)
      await module.start()
    } catch (err) {
      this.logger?.log('kernel.lifecycle', 'error', `Module "${moduleId}" failed to start`, {
        error: err instanceof Error ? err.message : String(err),
      })
      await this.eventBus.publish({
        type: EventType.MODULE_ERROR,
        source: 'kernel',
        payload: { moduleId, error: err instanceof Error ? err.message : String(err) },
      })
      throw err
    }

    // 3. 发布启动事件（degraded 表示带降级启动）
    const startedDegraded = !check.ready || check.degraded.length > 0
    await this.eventBus.publish({
      type: EventType.MODULE_STARTED,
      source: 'kernel',
      payload: { moduleId, degraded: startedDegraded, degradedDeps: check.degraded },
    })
    this.logger?.log('kernel.lifecycle', 'info', `Module "${moduleId}" started${startedDegraded ? ' (degraded)' : ''}`)
  }

  /**
   * 停止单个模块
   *
   * 流程：依赖者检查 → stop() → 清理事件订阅 → stopped → 发布事件
   */
  async stopModule(moduleId: string, options: { cascade?: boolean; force?: boolean } = {}): Promise<void> {
    const module = this.registry.get(moduleId)
    if (!module) throw new ModuleNotFoundError(moduleId)

    const currentState = module.getStatus()
    if (currentState === 'stopped' || currentState === 'registered') return // 幂等
    if (!STOPPABLE_STATES.has(currentState) && !options.force) {
      throw new InvalidModuleStateError(moduleId, currentState, 'stop')
    }

    // 1. 检查是否有其他活跃模块依赖它
    if (!options.force) {
      const impact = this.depResolver.getImpactChain(moduleId)
      const activeDependents = impact.directDependents.filter((id) => {
        const dep = this.registry.get(id)
        return dep && ['active', 'degraded', 'paused'].includes(dep.getStatus())
      })
      if (activeDependents.length > 0) {
        if (!options.cascade) {
          throw new HasDependentsError(moduleId, activeDependents)
        }
        // 级联停止依赖者
        for (const depId of activeDependents) {
          await this.stopModule(depId, { cascade: true })
        }
      }
    }

    // 2. 停止模块
    try {
      await module.stop()
    } catch (err) {
      this.logger?.log('kernel.lifecycle', 'error', `Module "${moduleId}" failed to stop cleanly`, {
        error: err instanceof Error ? err.message : String(err),
      })
      if (!options.force) throw err
    }

    // 3. 清理该模块的事件订阅
    this.eventBus.unsubscribeAll(moduleId)

    // 4. 发布停止事件
    await this.eventBus.publish({
      type: EventType.MODULE_STOPPED,
      source: 'kernel',
      payload: { moduleId },
    })
    this.logger?.log('kernel.lifecycle', 'info', `Module "${moduleId}" stopped`)
  }

  /** 暂停模块（保留状态，停止处理新事件） */
  async pauseModule(moduleId: string): Promise<void> {
    const module = this.registry.get(moduleId)
    if (!module) throw new ModuleNotFoundError(moduleId)

    if (module.getStatus() !== 'active') {
      throw new InvalidModuleStateError(moduleId, module.getStatus(), 'pause')
    }

    await module.pause()
    await this.eventBus.publish({
      type: EventType.MODULE_PAUSED,
      source: 'kernel',
      payload: { moduleId },
    })
  }

  /** 恢复模块 */
  async resumeModule(moduleId: string): Promise<void> {
    const module = this.registry.get(moduleId)
    if (!module) throw new ModuleNotFoundError(moduleId)

    if (module.getStatus() !== 'paused') {
      throw new InvalidModuleStateError(moduleId, module.getStatus(), 'resume')
    }

    await module.resume()
    await this.eventBus.publish({
      type: EventType.MODULE_RESUMED,
      source: 'kernel',
      payload: { moduleId },
    })
  }

  /** 热重启模块（stop → start，配置重新加载） */
  async restartModule(moduleId: string): Promise<void> {
    await this.stopModule(moduleId, { force: true })
    await this.startModule(moduleId)
  }

  /**
   * 系统级：按依赖顺序启动所有已启用模块
   */
  async bootAll(enabledModuleIds?: string[]): Promise<string[]> {
    const order = this.depResolver.getStartupOrder()
    const enabled = enabledModuleIds ? new Set(enabledModuleIds) : null
    const started: string[] = []

    for (const moduleId of order) {
      if (enabled && !enabled.has(moduleId)) continue
      try {
        await this.startModule(moduleId)
        started.push(moduleId)
      } catch (err) {
        this.logger?.log('kernel.lifecycle', 'error', `Boot: failed to start "${moduleId}"`, {
          error: err instanceof Error ? err.message : String(err),
        })
        // 单个模块启动失败不阻塞整个系统（依赖它的模块会在 canStart 中被拦截）
      }
    }
    return started
  }

  /**
   * 系统级：优雅关闭所有模块（逆序停止）
   */
  async shutdownAll(): Promise<void> {
    let order: string[]
    try {
      order = this.depResolver.getStartupOrder()
    } catch {
      order = this.registry.ids()
    }

    // 逆序停止
    for (const moduleId of [...order].reverse()) {
      const module = this.registry.get(moduleId)
      if (!module) continue
      if (['active', 'degraded', 'paused', 'error'].includes(module.getStatus())) {
        try {
          await this.stopModule(moduleId, { force: true })
        } catch (err) {
          this.logger?.log('kernel.lifecycle', 'error', `Shutdown: failed to stop "${moduleId}"`, {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    await this.eventBus.publish({
      type: EventType.SYSTEM_SHUTDOWN,
      source: 'kernel',
      payload: {},
    })
  }
}