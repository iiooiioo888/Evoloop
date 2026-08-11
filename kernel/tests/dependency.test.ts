// ━━━ kernel/tests/dependency.test.ts ━━━
import { describe, expect, it } from 'vitest'
import { ModuleRegistry } from '../src/ModuleRegistry.js'
import { DependencyResolver } from '../src/DependencyResolver.js'
import { CircularDependencyError } from '../../shared/errors.js'
import { createMockModule } from './helpers.js'

function buildRegistry(
  defs: Array<{ id: string; deps?: string[]; policy?: 'disable' | 'degrade' | 'queue' | 'ignore' }>,
): ModuleRegistry {
  const registry = new ModuleRegistry()
  for (const def of defs) {
    registry.register(
      createMockModule({
        id: def.id,
        dependencies: def.deps ?? [],
        degradationPolicy: { whenDependencyUnavailable: def.policy ?? 'disable' },
      }),
    )
  }
  return registry
}

describe('DependencyResolver.getStartupOrder', () => {
  it('无依赖模块顺序稳定', () => {
    const registry = buildRegistry([{ id: 'a' }, { id: 'b' }])
    const resolver = new DependencyResolver(registry)
    const order = resolver.getStartupOrder()
    expect(order).toHaveLength(2)
    expect(new Set(order)).toEqual(new Set(['a', 'b']))
  })

  it('依赖者必须排在被依赖者之后', () => {
    // llm <- planner <- exec
    const registry = buildRegistry([
      { id: 'exec-loop', deps: ['task-planner'] },
      { id: 'task-planner', deps: ['llm-connector'] },
      { id: 'llm-connector' },
    ])
    const resolver = new DependencyResolver(registry)
    const order = resolver.getStartupOrder()

    expect(order.indexOf('llm-connector')).toBeLessThan(order.indexOf('task-planner'))
    expect(order.indexOf('task-planner')).toBeLessThan(order.indexOf('exec-loop'))
  })

  it('循环依赖应抛出 CircularDependencyError', () => {
    const registry = buildRegistry([
      { id: 'a', deps: ['b'] },
      { id: 'b', deps: ['a'] },
      { id: 'c' },
    ])
    const resolver = new DependencyResolver(registry)
    expect(() => resolver.getStartupOrder()).toThrow(CircularDependencyError)
  })
})

describe('DependencyResolver.canStart', () => {
  it('依赖未注册 → missing', () => {
    const registry = buildRegistry([{ id: 'a', deps: ['nonexistent'] }])
    const resolver = new DependencyResolver(registry)
    const result = resolver.canStart('a')
    expect(result.ready).toBe(false)
    expect(result.missing).toContain('nonexistent')
  })

  it('依赖已注册但未激活 → missing', () => {
    const registry = buildRegistry([
      { id: 'base' },
      { id: 'a', deps: ['base'] },
    ])
    const resolver = new DependencyResolver(registry)
    // base 处于 registered 状态（未启动）
    const result = resolver.canStart('a')
    expect(result.ready).toBe(false)
    expect(result.missing).toContain('base')
  })

  it('依赖激活 → ready', async () => {
    const registry = buildRegistry([
      { id: 'base' },
      { id: 'a', deps: ['base'] },
    ])
    // 手动激活 base
    const base = registry.get('base')!
    await base.init({} as never, {})
    await base.start()

    const resolver = new DependencyResolver(registry)
    const result = resolver.canStart('a')
    expect(result.ready).toBe(true)
    expect(result.missing).toHaveLength(0)
  })
})

describe('DependencyResolver.getImpactChain', () => {
  it('应识别直接与传递依赖者', () => {
    // llm <- planner <- exec
    const registry = buildRegistry([
      { id: 'llm' },
      { id: 'planner', deps: ['llm'], policy: 'degrade' },
      { id: 'exec', deps: ['planner'], policy: 'disable' },
    ])
    const resolver = new DependencyResolver(registry)
    const impact = resolver.getImpactChain('llm')

    expect(impact.directDependents).toEqual(['planner'])
    expect(impact.transitiveDependents).toEqual(['exec'])
    expect(impact.willDegrade).toContain('planner')
    expect(impact.willDisable).toContain('exec')
  })

  it('无依赖者时返回空', () => {
    const registry = buildRegistry([{ id: 'llm' }, { id: 'other' }])
    const resolver = new DependencyResolver(registry)
    const impact = resolver.getImpactChain('llm')
    expect(impact.directDependents).toHaveLength(0)
    expect(impact.transitiveDependents).toHaveLength(0)
  })
})

describe('DependencyResolver.getTopologyGraph', () => {
  it('应构建完整的节点与边', () => {
    const registry = buildRegistry([
      { id: 'llm' },
      { id: 'planner', deps: ['llm'] },
    ])
    const resolver = new DependencyResolver(registry)
    const graph = resolver.getTopologyGraph()

    expect(graph.nodes['llm'].dependents).toEqual(['planner'])
    expect(graph.nodes['planner'].dependsOn).toEqual(['llm'])
    expect(graph.startupOrder).toEqual(['llm', 'planner'])
  })
})