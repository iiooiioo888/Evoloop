// ━━━ kernel/tests/eventbus.test.ts ━━━
import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../src/EventBus.js'
import { matchEventPattern } from '../../shared/events.js'

describe('matchEventPattern', () => {
  it('精确匹配', () => {
    expect(matchEventPattern('task.created', 'task.created')).toBe(true)
    expect(matchEventPattern('task.created', 'task.completed')).toBe(false)
  })

  it('全局通配符 *', () => {
    expect(matchEventPattern('*', 'task.created')).toBe(true)
    expect(matchEventPattern('*', 'anything')).toBe(true)
  })

  it('单层通配符 task.*', () => {
    expect(matchEventPattern('task.*', 'task.created')).toBe(true)
    expect(matchEventPattern('task.*', 'task.step.started')).toBe(false) // 两层不匹配
    expect(matchEventPattern('task.*', 'sandbox.created')).toBe(false)
  })

  it('多层通配符 task.>', () => {
    expect(matchEventPattern('task.>', 'task.created')).toBe(true)
    expect(matchEventPattern('task.>', 'task.step.started')).toBe(true)
    expect(matchEventPattern('task.>', 'task.step.deep.event')).toBe(true)
    expect(matchEventPattern('task.>', 'sandbox.created')).toBe(false)
    // "task.>" 不匹配 "task" 本身（必须有子层级）
    expect(matchEventPattern('task.>', 'task')).toBe(false)
  })
})

describe('EventBus', () => {
  it('发布事件应触发匹配的订阅者', async () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.subscribe('task.created', handler, { ownerModuleId: 'test' })
    await bus.publish({ type: 'task.created', source: 'test', payload: { id: 1 } })

    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0][0]
    expect(event.type).toBe('task.created')
    expect(event.id).toBeDefined()
    expect(event.timestamp).toBeGreaterThan(0)
    expect(event.correlationId).toBeDefined()
  })

  it('不匹配的订阅者不应被触发', async () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.subscribe('task.created', handler)
    await bus.publish({ type: 'sandbox.ready', source: 'test', payload: {} })

    expect(handler).not.toHaveBeenCalled()
  })

  it('应按优先级顺序执行处理器（数字越小越先）', async () => {
    const bus = new EventBus()
    const order: number[] = []

    bus.subscribe('evt', async () => { order.push(2) }, { priority: 200 })
    bus.subscribe('evt', async () => { order.push(1) }, { priority: 10 })
    bus.subscribe('evt', async () => { order.push(3) }, { priority: 300 })

    await bus.publish({ type: 'evt', source: 'test', payload: {} })
    expect(order).toEqual([1, 2, 3])
  })

  it('filter 函数应过滤事件', async () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.subscribe('task.*', handler, {
      filter: (e) => (e.payload as { urgent?: boolean }).urgent === true,
    })

    await bus.publish({ type: 'task.created', source: 'test', payload: { urgent: false } })
    expect(handler).not.toHaveBeenCalled()

    await bus.publish({ type: 'task.created', source: 'test', payload: { urgent: true } })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('处理器抛错应进入死信队列，不影响其他订阅者', async () => {
    const bus = new EventBus()
    const failingHandler = vi.fn(async () => { throw new Error('boom') })
    const okHandler = vi.fn()

    bus.subscribe('evt', failingHandler, { priority: 1 })
    bus.subscribe('evt', okHandler, { priority: 2 })

    await bus.publish({ type: 'evt', source: 'test', payload: {} })

    expect(failingHandler).toHaveBeenCalled()
    expect(okHandler).toHaveBeenCalled() // 不受前者失败影响
    expect(bus.getDeadLetters()).toHaveLength(1)
    expect(bus.getDeadLetters()[0].error.message).toBe('boom')
  })

  it('unsubscribe 应取消订阅', async () => {
    const bus = new EventBus()
    const handler = vi.fn()

    const subId = bus.subscribe('evt', handler)
    bus.unsubscribe(subId)

    await bus.publish({ type: 'evt', source: 'test', payload: {} })
    expect(handler).not.toHaveBeenCalled()
  })

  it('unsubscribeAll 应清理指定模块的所有订阅', async () => {
    const bus = new EventBus()
    const handlerA = vi.fn()
    const handlerB = vi.fn()

    bus.subscribe('evt.a', handlerA, { ownerModuleId: 'module-a' })
    bus.subscribe('evt.b', handlerA, { ownerModuleId: 'module-a' })
    bus.subscribe('evt.a', handlerB, { ownerModuleId: 'module-b' })

    bus.unsubscribeAll('module-a')

    await bus.publish({ type: 'evt.a', source: 'test', payload: {} })
    expect(handlerA).not.toHaveBeenCalled()
    expect(handlerB).toHaveBeenCalledTimes(1)
  })

  it('replay 应按时间戳与模式过滤回放缓冲', async () => {
    const bus = new EventBus()
    const t0 = Date.now()

    await bus.publish({ type: 'task.created', source: 'test', payload: {}, timestamp: t0 + 1 })
    await bus.publish({ type: 'sandbox.ready', source: 'test', payload: {}, timestamp: t0 + 2 })
    await bus.publish({ type: 'task.completed', source: 'test', payload: {}, timestamp: t0 + 3 })

    const all = bus.replay(t0)
    expect(all).toHaveLength(3)

    const taskOnly = bus.replay(t0, 'task.*')
    expect(taskOnly).toHaveLength(2)
    expect(taskOnly.map((e) => e.type)).toEqual(['task.created', 'task.completed'])

    const afterT2 = bus.replay(t0 + 2)
    expect(afterT2).toHaveLength(2)
  })

  it('回放缓冲应遵守最大长度（环形覆盖）', async () => {
    const bus = new EventBus({ replayBufferSize: 3 })

    for (let i = 0; i < 5; i++) {
      await bus.publish({ type: `evt.${i}`, source: 'test', payload: { i } })
    }

    const replayed = bus.replay(0)
    expect(replayed).toHaveLength(3)
    expect(replayed.map((e) => (e.payload as { i: number }).i)).toEqual([2, 3, 4])
  })
})