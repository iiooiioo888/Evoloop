// ━━━ kernel/tests/helpers.ts ━━━
// 测试辅助：模拟模块工厂与静默日志器

import type {
  KernelAPI,
  LogLevel,
  Module,
  ModuleManifest,
  ModuleStatus,
} from '../../shared/interfaces.js'
import type { Logger } from '../src/types.js'

/** 静默日志器：不输出到控制台，但保留记录供断言 */
export class SilentLogger implements Logger {
  entries: Array<{ moduleId: string; level: LogLevel; message: string }> = []
  log(moduleId: string, level: LogLevel, message: string): void {
    this.entries.push({ moduleId, level, message })
  }
}

export interface MockModuleOptions {
  id: string
  dependencies?: string[]
  capabilities?: string[]
  degradationPolicy?: ModuleManifest['degradationPolicy']
  /** start() 时是否抛错 */
  failOnStart?: boolean
}

/** 创建可控的模拟模块 */
export function createMockModule(options: MockModuleOptions): Module & {
  initCalled: boolean
  startCalled: boolean
  stopCalled: boolean
  configReceived: Record<string, unknown> | null
} {
  const manifest: ModuleManifest = {
    id: options.id,
    version: '1.0.0',
    name: `Mock ${options.id}`,
    description: 'Test module',
    capabilities: options.capabilities ?? [],
    dependencies: options.dependencies ?? [],
    permissions: [],
    configSchema: {},
    degradationPolicy: options.degradationPolicy ?? { whenDependencyUnavailable: 'disable' },
  }

  const state = {
    initCalled: false,
    startCalled: false,
    stopCalled: false,
    configReceived: null as Record<string, unknown> | null,
  }

  let status: ModuleStatus = 'registered'

  const module: Module & {
    readonly initCalled: boolean
    readonly startCalled: boolean
    readonly stopCalled: boolean
    readonly configReceived: Record<string, unknown> | null
  } = {
    manifest,

    get initCalled() {
      return state.initCalled
    },
    get startCalled() {
      return state.startCalled
    },
    get stopCalled() {
      return state.stopCalled
    },
    get configReceived() {
      return state.configReceived
    },

    async init(_kernel: KernelAPI, config: Record<string, unknown>) {
      state.initCalled = true
      state.configReceived = config
      status = 'initializing'
    },
    async start() {
      if (options.failOnStart) throw new Error(`mock start failure: ${options.id}`)
      state.startCalled = true
      status = 'active'
    },
    async pause() {
      status = 'paused'
    },
    async resume() {
      status = 'active'
    },
    async stop() {
      state.stopCalled = true
      status = 'stopped'
    },
    async destroy() {
      status = 'unregistered'
    },
    async onConfigChange(newConfig: Record<string, unknown>) {
      state.configReceived = newConfig
    },
    getStatus() {
      return status
    },
  }

  return module
}
