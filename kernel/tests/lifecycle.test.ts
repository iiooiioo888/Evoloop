// ━━━ kernel/tests/lifecycle.test.ts ━━━
import { describe, expect, it } from 'vitest'
import { Kernel } from '../src/index.js'
import { EventType } from '../../shared/events.js'
import { HasDependentsError, ModuleNotFoundError } from '../../shared/errors.js'
import { createMockModule, SilentLogger } from './helpers.js'

function createTestKernel(): Kernel {
  return new Kernel({
    config: { modulesDir: '__nonexistent__', configDir: '__nonexistent__', logLevel: 'error' },
    logger: new SilentLogger(),
  })
}

describe('LifecycleManager（通过 Kernel）', () => {
  it('启动模块：registered → active，并发布 module.started 事件', async () => {
    const kernel = createTestKernel()
    const mod = createMockModule({ id: 'demo' })
    kernel.registerModule(mod)

    const startedEvents: unknown[] = []
    kernel.eventBus.subscribe(EventType.MODULE_STARTED, async (e) => {
      startedEvents.push(e.payload)
    })

    await kernel.admin.enableModule('demo')

    expect(mod.getStatus()).toBe('active')
    expect(mod.initCalled).toBe(true)
    expect(mod.startCalled).toBe(true)
    expect(startedEvents).toHaveLength(1)
  })

  it('启动不存在的模块应抛出 ModuleNotFoundError', async () => {
    const kernel = createTestKernel()
    await expect(kernel.admin.enableModule('ghost')).rejects.toThrow(ModuleNotFoundError)
  })

  it('依赖顺序：bootAll 按拓扑顺序启动', async () => {
    const kernel = createTestKernel()
    const startOrder: string[] = []

    const llm = createMockModule({ id: 'llm' })
    const planner = createMockModule({ id: 'planner', dependencies: ['llm'] })

    // 包装 start 以记录顺序
    const origLlmStart = llm.start.bind(llm)
    llm.start = async () => { await origLlmStart(); startOrder.push('llm') }
    const origPlannerStart = planner.start.bind(planner)
    planner.start = async () => { await origPlannerStart(); startOrder.push('planner') }

    // 故意乱序注册
    kernel.registerModule(planner)
    kernel.registerModule(llm)

    await kernel.lifecycle.bootAll()

    expect(startOrder).toEqual(['llm', 'planner'])
    expect(planner.getStatus()).toBe('active')
  })

  it('停止被活跃模块依赖的模块应抛出 HasDependentsError', async () => {
    const kernel = createTestKernel()
    const llm = createMockModule({ id: 'llm' })
    const planner = createMockModule({ id: 'planner', dependencies: ['llm'] })
    kernel.registerModule(llm)
    kernel.registerModule(planner)

    await kernel.lifecycle.bootAll()

    await expect(kernel.lifecycle.stopModule('llm')).rejects.toThrow(HasDependentsError)
  })

  it('级联停止：cascade=true 应先停依赖者', async () => {
    const kernel = createTestKernel()
    const llm = createMockModule({ id: 'llm' })
    const planner = createMockModule({ id: 'planner', dependencies: ['llm'] })
    kernel.registerModule(llm)
    kernel.registerModule(planner)

    await kernel.lifecycle.bootAll()
    await kernel.lifecycle.stopModule('llm', { cascade: true })

    expect(planner.getStatus()).toBe('stopped')
    expect(llm.getStatus()).toBe('stopped')
  })

  it('暂停与恢复', async () => {
    const kernel = createTestKernel()
    const mod = createMockModule({ id: 'demo' })
    kernel.registerModule(mod)
    await kernel.admin.enableModule('demo')

    await kernel.admin.pauseModule('demo')
    expect(mod.getStatus()).toBe('paused')

    await kernel.admin.resumeModule('demo')
    expect(mod.getStatus()).toBe('active')
  })

  it('热重启：restartModule 重新调用 init/start', async () => {
    const kernel = createTestKernel()
    const mod = createMockModule({ id: 'demo' })
    kernel.registerModule(mod)
    await kernel.admin.enableModule('demo')

    await kernel.admin.restartModule('demo')
    expect(mod.getStatus()).toBe('active')
    expect(mod.stopCalled).toBe(true)
  })

  it('shutdownAll 逆序停止所有模块', async () => {
    const kernel = createTestKernel()
    const llm = createMockModule({ id: 'llm' })
    const planner = createMockModule({ id: 'planner', dependencies: ['llm'] })
    kernel.registerModule(llm)
    kernel.registerModule(planner)

    await kernel.lifecycle.bootAll()
    await kernel.lifecycle.shutdownAll()

    expect(llm.getStatus()).toBe('stopped')
    expect(planner.getStatus()).toBe('stopped')
  })

  it('启动失败应发布 module.error 事件', async () => {
    const kernel = createTestKernel()
    const mod = createMockModule({ id: 'bad', failOnStart: true })
    kernel.registerModule(mod)

    const errorEvents: unknown[] = []
    kernel.eventBus.subscribe(EventType.MODULE_ERROR, async (e) => {
      errorEvents.push(e.payload)
    })

    await expect(kernel.admin.enableModule('bad')).rejects.toThrow()
    expect(errorEvents).toHaveLength(1)
  })

  it('admin.getAllModules 返回清单与状态', async () => {
    const kernel = createTestKernel()
    const mod = createMockModule({ id: 'demo', capabilities: ['test-cap'] })
    kernel.registerModule(mod)
    await kernel.admin.enableModule('demo')

    const all = kernel.admin.getAllModules()
    expect(all).toHaveLength(1)
    expect(all[0].manifest.id).toBe('demo')
    expect(all[0].status).toBe('active')
  })

  it('admin.findModulesByCapability 按能力查找', () => {
    const kernel = createTestKernel()
    kernel.registerModule(createMockModule({ id: 'a', capabilities: ['cap-x'] }))
    kernel.registerModule(createMockModule({ id: 'b', capabilities: ['cap-y'] }))

    const found = kernel.registry.findByCapability('cap-x')
    expect(found).toHaveLength(1)
    expect(found[0].manifest.id).toBe('a')
  })

  it('updateConfig 触发 onConfigChange 与 module.config.changed 事件', async () => {
    const kernel = createTestKernel()
    const mod = createMockModule({ id: 'demo' })
    kernel.registerModule(mod)
    await kernel.admin.enableModule('demo')

    const configEvents: unknown[] = []
    kernel.eventBus.subscribe(EventType.MODULE_CONFIG_CHANGED, async (e) => {
      configEvents.push(e.payload)
    })

    await kernel.admin.updateConfig('demo', { foo: 'bar' })
    expect(mod.configReceived).toEqual({ foo: 'bar' })
    expect(configEvents).toHaveLength(1)
  })
})

describe('Kernel.boot（端到端）', () => {
  it('boot 应发布 system.ready 事件', async () => {
    const kernel = createTestKernel()
    const readyEvents: unknown[] = []
    kernel.eventBus.subscribe(EventType.SYSTEM_READY, async (e) => {
      readyEvents.push(e.payload)
    })

    await kernel.boot()
    expect(readyEvents).toHaveLength(1)
  })
})