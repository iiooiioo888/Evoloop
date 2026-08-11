// ━━━ kernel/src/DependencyResolver.ts ━━━
// 依赖解析器 —— 拓扑排序、启动顺序、影响分析

import { CircularDependencyError } from '../../shared/errors.js'
import type { ModuleRegistry } from './ModuleRegistry.js'
import type { DependencyGraph, DependencyNode, ImpactAnalysis, StartCheckResult } from './types.js'

/** 被视为"可用"的依赖状态 */
const AVAILABLE_STATES = new Set(['active', 'degraded'])

/**
 * 依赖解析器
 *
 * 职责：
 * 1. 启动前检查：模块依赖是否满足
 * 2. 影响分析：禁用某模块会波及哪些模块
 * 3. 拓扑排序：计算启动顺序（含循环依赖检测）
 */
export class DependencyResolver {
  constructor(private readonly registry: ModuleRegistry) {}

  /**
   * 启动前检查：某模块的所有依赖是否满足
   */
  canStart(moduleId: string): StartCheckResult {
    const manifest = this.registry.getManifest(moduleId)
    if (!manifest) {
      return { ready: false, missing: [moduleId], degraded: [] }
    }

    const missing: string[] = []
    const degraded: string[] = []

    for (const depId of manifest.dependencies) {
      const dep = this.registry.get(depId)
      if (!dep) {
        missing.push(depId)
        continue
      }
      const status = dep.getStatus()
      if (!AVAILABLE_STATES.has(status)) {
        missing.push(depId)
      } else if (status === 'degraded') {
        degraded.push(depId)
      }
    }

    return { ready: missing.length === 0, missing, degraded }
  }

  /**
   * 影响分析：禁用某模块会影响谁
   */
  getImpactChain(moduleId: string): ImpactAnalysis {
    const directDependents = this.getDirectDependents(moduleId)

    // BFS 收集所有传递依赖者
    const transitive = new Set<string>()
    const queue = [...directDependents]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (transitive.has(current)) continue
      transitive.add(current)
      for (const next of this.getDirectDependents(current)) {
        if (!transitive.has(next)) queue.push(next)
      }
    }

    const transitiveDependents = [...transitive].filter((id) => !directDependents.includes(id))

    // 根据降级策略分类受影响的模块
    const willDisable: string[] = []
    const willDegrade: string[] = []
    for (const depId of transitive) {
      const manifest = this.registry.getManifest(depId)
      if (!manifest) continue
      switch (manifest.degradationPolicy.whenDependencyUnavailable) {
        case 'disable':
          willDisable.push(depId)
          break
        case 'degrade':
        case 'queue':
        case 'ignore':
          willDegrade.push(depId)
          break
      }
    }

    return { directDependents, transitiveDependents, willDisable, willDegrade }
  }

  /**
   * 计算启动顺序（拓扑排序，Kahn 算法）
   * @throws CircularDependencyError 若存在循环依赖
   */
  getStartupOrder(): string[] {
    const ids = this.registry.ids()

    // 入度 = 该模块依赖的（已注册的）模块数量
    const inDegree = new Map<string, number>()
    const dependents = new Map<string, string[]>() // depId -> 依赖它的模块列表

    for (const id of ids) {
      inDegree.set(id, 0)
      dependents.set(id, [])
    }

    for (const id of ids) {
      const manifest = this.registry.getManifest(id)!
      for (const depId of manifest.dependencies) {
        if (!this.registry.has(depId)) continue // 未注册的依赖跳过（由 canStart 检查）
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1)
        dependents.get(depId)!.push(id)
      }
    }

    const queue = ids.filter((id) => inDegree.get(id) === 0)
    const order: string[] = []

    while (queue.length > 0) {
      const current = queue.shift()!
      order.push(current)
      for (const dependent of dependents.get(current) ?? []) {
        const newDegree = (inDegree.get(dependent) ?? 1) - 1
        inDegree.set(dependent, newDegree)
        if (newDegree === 0) queue.push(dependent)
      }
    }

    if (order.length !== ids.length) {
      // 找出参与循环的模块
      const cycle = ids.filter((id) => !order.includes(id))
      throw new CircularDependencyError(cycle)
    }

    return order
  }

  /**
   * 构建依赖拓扑图（供控制面板可视化）
   */
  getTopologyGraph(): DependencyGraph {
    const nodes: Record<string, DependencyNode> = {}
    const ids = this.registry.ids()

    for (const id of ids) {
      nodes[id] = {
        moduleId: id,
        dependsOn: [...(this.registry.getManifest(id)?.dependencies ?? [])],
        dependents: this.getDirectDependents(id),
      }
    }

    let startupOrder: string[] = []
    try {
      startupOrder = this.getStartupOrder()
    } catch {
      // 存在循环依赖时，startupOrder 保持为空
    }

    return { nodes, startupOrder }
  }

  /** 获取直接依赖指定模块的模块列表 */
  private getDirectDependents(moduleId: string): string[] {
    const result: string[] = []
    for (const id of this.registry.ids()) {
      const manifest = this.registry.getManifest(id)
      if (manifest?.dependencies.includes(moduleId)) {
        result.push(id)
      }
    }
    return result
  }
}