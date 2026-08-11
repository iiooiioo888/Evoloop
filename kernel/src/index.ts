// ━━━ kernel/src/index.ts ━━━
// 微内核入口 —— 组装所有核心组件

import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { EventType } from '../../shared/events.js'
import type {
  KernelAPI,
  LogLevel,
  Module,
  ModuleFactory,
  ModuleStatus,
  Permission,
} from '../../shared/interfaces.js'
import { DependencyResolver } from './DependencyResolver.js'
import { EventBus } from './EventBus.js'
import { LifecycleManager } from './LifecycleManager.js'
import { ModuleRegistry } from './ModuleRegistry.js'
import { PolicyEngine } from './PolicyEngine.js'
import type { DependencyGraph, ImpactAnalysis, KernelConfig, LogEntry, Logger } from './types.js'

export interface KernelOptions {
  config?: Partial<KernelConfig>
  logger?: Logger
}

/** 默认控制台日志器 */
class ConsoleLogger implements Logger {
  private entries: LogEntry[] = []
  constructor(private readonly minLevel: LogLevel = 'info') {}

  private static LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

  log(moduleId: string, level: LogLevel, message: string, meta?: unknown): void {
    const entry: LogEntry = { timestamp: Date.now(), moduleId, level, message, meta }
    this.entries.push(entry)
    if (ConsoleLogger.LEVELS[level] >= ConsoleLogger.LEVELS[this.minLevel]) {
      const line = `[${new Date(entry.timestamp).toISOString()}] [${level.toUpperCase()}] [${moduleId}] ${message}`
      if (level === 'error') console.error(line, meta ?? '')
      else if (level === 'warn') console.warn(line, meta ?? '')
      else console.log(line, meta ?? '')
    }
  }

  getEntries(): readonly LogEntry[] {
    return [...this.entries]
  }
}

/**
 * EvoLoop 微内核
 *
 * 职责：
 * 1. 组装 EventBus / ModuleRegistry / DependencyResolver / LifecycleManager / PolicyEngine
 * 2. 向模块暴露最小权限 KernelAPI
 * 3. 系统启动（boot）与关闭（shutdown）
 * 4. 控制面板管理接口（admin）
 */
export class Kernel {
  readonly registry: ModuleRegistry
  readonly eventBus: EventBus
  readonly lifecycle: LifecycleManager
  readonly depResolver: DependencyResolver
  readonly policyEngine: PolicyEngine

  private readonly logger: Logger
  private readonly config: KernelConfig
  /** 模块配置缓存：moduleId -> config */
  private moduleConfigs: Map<string, Record<string, unknown>> = new Map()
  private booted = false

  constructor(options: KernelOptions = {}) {
    this.config = {
      modulesDir: options.config?.modulesDir ?? 'modules',
      configDir: options.config?.configDir ?? 'config',
      replayBufferSize: options.config?.replayBufferSize ?? 10_000,
      logLevel: options.config?.logLevel ?? 'info',
    }
    this.logger = options.logger ?? new ConsoleLogger(this.config.logLevel)

    this.eventBus = new EventBus({ replayBufferSize: this.config.replayBufferSize, logger: this.logger })
    this.registry = new ModuleRegistry({ eventBus: this.eventBus })
    this.depResolver = new DependencyResolver(this.registry)
    this.policyEngine = new PolicyEngine({ logger: this.logger })

    this.lifecycle = new LifecycleManager({
      registry: this.registry,
      eventBus: this.eventBus,
      depResolver: this.depResolver,
      kernelAPI: this.getAPI(),
      loadConfig: (moduleId) => this.loadModuleConfig(moduleId),
      logger: this.logger,
    })
  }

  /**
   * 对外暴露给模块的 API（最小权限）
   */
  getAPI(): KernelAPI {
    return {
      publish: (event) => this.eventBus.publish(event),
      subscribe: (pattern, handler, opts) =>
        this.eventBus.subscribe(pattern, handler, opts),
      unsubscribe: (subscriptionId) => this.eventBus.unsubscribe(subscriptionId),
      getModule: (id) => this.registry.get(id),
      findModulesByCapability: (cap) => this.registry.findByCapability(cap),
      checkPermission: (moduleId: string, permission: Permission) => {
        const manifest = this.registry.getManifest(moduleId)
        if (!manifest) return false
        return this.policyEngine.check(manifest, permission)
      },
      getConfig: (moduleId) => this.loadModuleConfig(moduleId),
      log: (moduleId, level, message, meta) => this.logger.log(moduleId, level, message, meta),
    }
  }

  /** 注册单个模块（编程式，测试或内嵌模块用） */
  registerModule(module: Module): void {
    this.registry.register(module)
  }

  /**
   * 启动系统
   *
   * 1. 加载全局策略
   * 2. 加载模块启用清单与模块配置
   * 3. 扫描 modules/ 目录，动态加载所有模块
   * 4. 计算启动顺序并按序启动
   * 5. 发布 system.ready 事件
   */
  async boot(): Promise<void> {
    if (this.booted) return
    const configDir = resolve(this.config.configDir)

    // 1. 加载全局策略
    await this.policyEngine.load(join(configDir, 'policies.json'))

    // 2. 加载模块启用清单
    const enabledModules = await this.loadEnabledModules(configDir)

    // 3. 扫描并加载模块
    await this.scanAndLoadModules(resolve(this.config.modulesDir), enabledModules)

    // 4. 按依赖顺序启动
    const started = await this.lifecycle.bootAll(enabledModules)

    // 5. 发布系统就绪事件
    await this.eventBus.publish({
      type: EventType.SYSTEM_READY,
      source: 'kernel',
      payload: { modulesLoaded: this.registry.size, modulesStarted: started.length },
    })
    this.logger.log('kernel', 'info', `System ready: ${started.length}/${this.registry.size} modules started`)
    this.booted = true
  }

  /** 优雅关闭 */
  async shutdown(): Promise<void> {
    await this.lifecycle.shutdownAll()
    this.booted = false
  }

  /**
   * 控制面板调用的管理接口
   */
  admin = {
    enableModule: (id: string) => this.lifecycle.startModule(id),
    disableModule: (id: string) => this.lifecycle.stopModule(id, { cascade: true }),
    restartModule: (id: string) => this.lifecycle.restartModule(id),
    pauseModule: (id: string) => this.lifecycle.pauseModule(id),
    resumeModule: (id: string) => this.lifecycle.resumeModule(id),
    getModuleStatus: (id: string): ModuleStatus | undefined => this.registry.get(id)?.getStatus(),
    getAllModules: () =>
      this.registry.list().map((m) => ({
        manifest: m.manifest,
        status: m.getStatus(),
      })),
    getDependencyGraph: (): DependencyGraph => this.depResolver.getTopologyGraph(),
    getImpactAnalysis: (id: string): ImpactAnalysis => this.depResolver.getImpactChain(id),
    updateConfig: (id: string, config: Record<string, unknown>) => this.updateModuleConfig(id, config),
    getDeadLetters: () => this.eventBus.getDeadLetters(),
    replayEvents: (fromTimestamp: number, pattern?: string) => this.eventBus.replay(fromTimestamp, pattern),
  }

  // ─── 私有方法 ───────────────────────────────────────────

  /** 加载模块启用清单（config/modules.json） */
  private async loadEnabledModules(configDir: string): Promise<string[] | undefined> {
    try {
      const raw = await readFile(join(configDir, 'modules.json'), 'utf-8')
      const parsed = JSON.parse(raw) as { enabled?: string[] }
      return parsed.enabled
    } catch {
      return undefined // 无清单 = 全部启用
    }
  }

  /** 扫描模块目录并动态加载 */
  private async scanAndLoadModules(modulesDir: string, enabled?: string[]): Promise<void> {
    let entries: string[]
    try {
      entries = await readdir(modulesDir)
    } catch {
      this.logger.log('kernel', 'warn', `Modules directory not found: ${modulesDir}`)
      return
    }

    for (const entry of entries) {
      if (enabled && !enabled.includes(entry)) continue
      const modulePath = join(modulesDir, entry, 'src', 'index.ts')
      const modulePathJs = join(modulesDir, entry, 'src', 'index.js')

      // 优先加载编译后的 JS，其次 TS（tsx 运行时）
      for (const candidate of [modulePathJs, modulePath]) {
        try {
          const mod = (await import(pathToFileURL(candidate).href)) as { default?: ModuleFactory }
          if (mod.default) {
            const instance = typeof mod.default === 'function' ? mod.default() : mod.default
            this.registry.register(instance)
            this.logger.log('kernel', 'info', `Module loaded: ${entry}`)
            break
          }
        } catch (err) {
          // 第一个候选失败时尝试下一个
          if (candidate === modulePathJs) continue
          this.logger.log('kernel', 'error', `Failed to load module "${entry}"`, {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  }

  /** 读取模块配置（config/modules/<id>.json 或内存缓存） */
  private loadModuleConfig(moduleId: string): Record<string, unknown> {
    if (this.moduleConfigs.has(moduleId)) {
      return this.moduleConfigs.get(moduleId)!
    }
    return {}
  }

  /** 更新模块配置并触发热更新 */
  private async updateModuleConfig(moduleId: string, config: Record<string, unknown>): Promise<void> {
    const module = this.registry.get(moduleId)
    if (!module) return

    const merged = { ...this.loadModuleConfig(moduleId), ...config }
    this.moduleConfigs.set(moduleId, merged)

    await module.onConfigChange(merged)
    await this.eventBus.publish({
      type: EventType.MODULE_CONFIG_CHANGED,
      source: 'kernel',
      payload: { moduleId, config: merged },
    })
  }
}

// 导出所有核心组件，方便外部使用
export { EventBus } from './EventBus.js'
export { ModuleRegistry } from './ModuleRegistry.js'
export { DependencyResolver } from './DependencyResolver.js'
export { LifecycleManager } from './LifecycleManager.js'
export { PolicyEngine } from './PolicyEngine.js'
export * from './types.js'