// ━━━ kernel/src/EventBus.ts ━━━
// 事件总线 —— 模块间通信的唯一通道

import { randomUUID } from 'node:crypto'
import { matchEventPattern, type DomainEvent, type EventHandler } from '../../shared/events.js'
import type { DeadLetter, Logger, SubscribeOptions, Subscription } from './types.js'

const DEFAULT_PRIORITY = 100
const DEFAULT_REPLAY_BUFFER_SIZE = 10_000

export interface EventBusOptions {
  replayBufferSize?: number
  logger?: Logger
}

/**
 * 事件总线
 *
 * 职责：
 * 1. 发布/订阅领域事件（支持通配符匹配）
 * 2. 按优先级顺序执行处理器
 * 3. 处理失败的事件进入死信队列
 * 4. 所有事件写入回放缓冲（调试/审计）
 * 5. 模块销毁时自动清理其订阅
 */
export class EventBus {
  /** 所有订阅，按订阅 ID 索引 */
  private subscriptions: Map<string, Subscription> = new Map()
  /** 死信队列：处理失败的事件暂存 */
  private deadLetterQueue: DeadLetter[] = []
  /** 事件回放缓冲 */
  private replayBuffer: DomainEvent[] = []
  private readonly replayBufferSize: number
  private readonly logger?: Logger

  constructor(options: EventBusOptions = {}) {
    this.replayBufferSize = options.replayBufferSize ?? DEFAULT_REPLAY_BUFFER_SIZE
    this.logger = options.logger
  }

  /**
   * 发布事件
   *
   * 流程：
   * 1. 补全事件元数据（id / timestamp / correlationId）
   * 2. 写入回放缓冲
   * 3. 匹配所有订阅者，按优先级排序（数字越小越先执行）
   * 4. 依次执行处理器；失败的订阅记入死信队列，不中断其他订阅者
   */
  async publish(
    event: Partial<DomainEvent> & Pick<DomainEvent, 'type' | 'source' | 'payload'>,
  ): Promise<void> {
    const fullEvent: DomainEvent = {
      id: event.id ?? randomUUID(),
      type: event.type,
      source: event.source,
      payload: event.payload,
      timestamp: event.timestamp ?? Date.now(),
      correlationId: event.correlationId ?? randomUUID(),
      causationId: event.causationId,
    }

    // 写入回放缓冲（环形）
    this.replayBuffer.push(fullEvent)
    if (this.replayBuffer.length > this.replayBufferSize) {
      this.replayBuffer.splice(0, this.replayBuffer.length - this.replayBufferSize)
    }

    // 匹配订阅者并按优先级排序
    const matched = [...this.subscriptions.values()]
      .filter((sub) => matchEventPattern(sub.pattern, fullEvent.type))
      .filter((sub) => (sub.filter ? sub.filter(fullEvent) : true))
      .sort((a, b) => a.priority - b.priority)

    // 依次执行处理器
    for (const sub of matched) {
      try {
        await sub.handler(fullEvent)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        this.deadLetterQueue.push({
          event: fullEvent,
          subscriptionId: sub.id,
          error,
          failedAt: Date.now(),
        })
        this.logger?.log(
          'kernel.eventbus',
          'error',
          `Event handler failed: pattern="${sub.pattern}" event="${fullEvent.type}"`,
          { error: error.message },
        )
      }
    }
  }

  /**
   * 订阅事件（支持通配符）
   * @returns 订阅 ID，用于取消订阅
   */
  subscribe(pattern: string, handler: EventHandler, options: SubscribeOptions = {}): string {
    const id = randomUUID()
    const subscription: Subscription = {
      id,
      pattern,
      handler,
      ownerModuleId: options.ownerModuleId ?? 'unknown',
      priority: options.priority ?? DEFAULT_PRIORITY,
      filter: options.filter,
    }
    this.subscriptions.set(id, subscription)
    return id
  }

  /** 取消订阅 */
  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId)
  }

  /** 模块销毁时，自动清理其所有订阅 */
  unsubscribeAll(ownerModuleId: string): void {
    for (const [id, sub] of this.subscriptions) {
      if (sub.ownerModuleId === ownerModuleId) {
        this.subscriptions.delete(id)
      }
    }
  }

  /**
   * 事件回放（用于调试/审计）
   * @param fromTimestamp 起始时间戳（含）
   * @param pattern 可选的事件类型过滤模式
   */
  replay(fromTimestamp: number, pattern?: string): DomainEvent[] {
    return this.replayBuffer.filter(
      (e) => e.timestamp >= fromTimestamp && (!pattern || matchEventPattern(pattern, e.type)),
    )
  }

  /** 获取死信队列（只读副本） */
  getDeadLetters(): readonly DeadLetter[] {
    return [...this.deadLetterQueue]
  }

  /** 清空死信队列 */
  clearDeadLetters(): void {
    this.deadLetterQueue = []
  }

  /** 当前订阅数量（调试用） */
  get subscriptionCount(): number {
    return this.subscriptions.size
  }
}