// ━━━ modules/llm-connector/src/index.ts ━━━
// LLM Connector 模块 —— 统一 LLM 调用抽象层（示例模块）

import type {
  KernelAPI,
  Module,
  ModuleManifest,
  ModuleStatus,
} from '../../../shared/interfaces.js'
import manifestJson from '../manifest.json' with { type: 'json' }

const manifest = manifestJson as unknown as ModuleManifest

/** 模块配置 */
interface LlmConnectorConfig {
  provider: string
  model?: string
  maxRetries?: number
  timeoutMs?: number
}

/**
 * LLM Connector 模块
 *
 * 能力：
 * - llm-call: 同步调用 LLM
 * - llm-stream: 流式调用 LLM
 * - model-routing: 模型路由
 *
 * 注意：这是框架示例实现，实际 LLM 调用逻辑待集成 LiteLLM 后补充。
 */
class LlmConnectorModule implements Module {
  readonly manifest = manifest

  private status: ModuleStatus = 'registered'
  private kernel: KernelAPI | null = null
  private config: LlmConnectorConfig = { provider: 'litellm-proxy', model: 'gpt-4o-mini', maxRetries: 3, timeoutMs: 60_000 }
  private subscriptionIds: string[] = []
  private callCount = 0

  async init(kernel: KernelAPI, config: Record<string, unknown>): Promise<void> {
    this.status = 'initializing'
    this.kernel = kernel
    this.config = { ...this.config, ...(config as Partial<LlmConnectorConfig>) }

    // 权限自检
    const allowed = kernel.checkPermission(manifest.id, { resource: 'llm', action: 'execute' })
    kernel.log(manifest.id, 'info', `Permission check (llm:execute): ${allowed}`)
  }

  async start(): Promise<void> {
    if (!this.kernel) throw new Error('Module not initialized')

    // 订阅任务事件示例：监听 task.created 并记录
    const subId = this.kernel.subscribe(
      'task.created',
      async (event) => {
        this.kernel?.log(manifest.id, 'debug', `Observed task.created: ${event.correlationId}`)
      },
      { ownerModuleId: manifest.id, priority: 50 },
    )
    this.subscriptionIds.push(subId)

    this.status = 'active'
    this.kernel.log(manifest.id, 'info', `LLM Connector started (provider=${this.config.provider})`)
  }

  async pause(): Promise<void> {
    this.status = 'paused'
  }

  async resume(): Promise<void> {
    this.status = 'active'
  }

  async stop(): Promise<void> {
    // 清理订阅
    if (this.kernel) {
      for (const id of this.subscriptionIds) {
        this.kernel.unsubscribe(id)
      }
    }
    this.subscriptionIds = []
    this.status = 'stopped'
  }

  async destroy(): Promise<void> {
    this.kernel = null
    this.status = 'unregistered'
  }

  async onConfigChange(newConfig: Record<string, unknown>): Promise<void> {
    this.config = { ...this.config, ...(newConfig as Partial<LlmConnectorConfig>) }
    this.kernel?.log(manifest.id, 'info', `Config updated: provider=${this.config.provider}`)
  }

  getStatus(): ModuleStatus {
    return this.status
  }

  // ─── 模块公开能力（供其他模块通过 registry 调用） ───

  /** 调用 LLM（示例桩实现） */
  async call(prompt: string, options?: { model?: string }): Promise<string> {
    if (this.status !== 'active') {
      throw new Error(`LLM Connector is ${this.status}, cannot call`)
    }
    this.callCount++
    const model = options?.model ?? this.config.model
    this.kernel?.log(manifest.id, 'info', `LLM call #${this.callCount} → ${model}`)
    // 桩实现：真实实现将通过 LiteLLM 代理调用
    return `[stub:${model}] response to: ${prompt.slice(0, 50)}`
  }

  /** 获取用量统计 */
  getStats(): { callCount: number; provider: string } {
    return { callCount: this.callCount, provider: this.config.provider }
  }
}

export default new LlmConnectorModule()