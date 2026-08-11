// ━━━ kernel/src/ModuleRegistry.ts ━━━
// 模块注册表 —— 所有已注册模块的中央索引

import type { Module, ModuleManifest, ModuleStatus } from '../../shared/interfaces.js'
import { ModuleAlreadyRegisteredError, ModuleNotFoundError } from '../../shared/errors.js'
import { EventType } from '../../shared/events.js'
import type { EventBus } from './EventBus.js'

export interface ModuleRegistryOptions {
  eventBus?: EventBus
}

/** 模块列表过滤条件 */
export interface ModuleFilter {
  status?: ModuleStatus
  capability?: string
}

/**
 * 模块注册表
 *
 * 职责：
 * 1. 注册/注销模块实例
 * 2. 按 ID / 状态 / 能力查询模块
 * 3. 注册时发布 "module.registered" 事件
 */
export class ModuleRegistry {
  private modules: Map<string, Module> = new Map()
  private manifests: Map<string, ModuleManifest> = new Map()
  private readonly eventBus?: EventBus

  constructor(options: ModuleRegistryOptions = {}) {
    this.eventBus = options.eventBus
  }

  /**
   * 注册模块
   * @throws ModuleAlreadyRegisteredError 若 ID 重复
   */
  register(module: Module): void {
    const id = module.manifest.id
    if (this.modules.has(id)) {
      throw new ModuleAlreadyRegisteredError(id)
    }
    this.modules.set(id, module)
    this.manifests.set(id, module.manifest)

    // 发布 "module.registered" 事件（fire-and-forget，不阻塞注册流程）
    void this.eventBus?.publish({
      type: EventType.MODULE_REGISTERED,
      source: 'kernel',
      payload: { moduleId: id, version: module.manifest.version },
    })
  }

  /** 获取模块实例 */
  get(moduleId: string): Module | undefined {
    return this.modules.get(moduleId)
  }

  /** 获取模块清单 */
  getManifest(moduleId: string): ModuleManifest | undefined {
    return this.manifests.get(moduleId)
  }

  /** 获取模块，不存在时抛出异常 */
  getOrThrow(moduleId: string): Module {
    const module = this.modules.get(moduleId)
    if (!module) throw new ModuleNotFoundError(moduleId)
    return module
  }

  /** 判断模块是否已注册 */
  has(moduleId: string): boolean {
    return this.modules.has(moduleId)
  }

  /** 列出所有模块（可按状态/能力过滤） */
  list(filter?: ModuleFilter): Module[] {
    let result = [...this.modules.values()]
    if (filter?.status) {
      result = result.filter((m) => m.getStatus() === filter.status)
    }
    if (filter?.capability) {
      result = result.filter((m) => m.manifest.capabilities.includes(filter.capability!))
    }
    return result
  }

  /** 按能力查找模块 */
  findByCapability(capability: string): Module[] {
    return [...this.modules.values()].filter((m) =>
      m.manifest.capabilities.includes(capability),
    )
  }

  /** 所有已注册模块 ID */
  ids(): string[] {
    return [...this.modules.keys()]
  }

  /** 注销模块（通常在模块 destroy 后调用） */
  unregister(moduleId: string): void {
    this.modules.delete(moduleId)
    this.manifests.delete(moduleId)
  }

  /** 已注册模块数量 */
  get size(): number {
    return this.modules.size
  }
}