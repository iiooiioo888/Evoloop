// ━━━ kernel/src/PolicyEngine.ts ━━━
// 策略引擎 —— 全局策略与权限检查

import { readFile } from 'node:fs/promises'
import type { ModuleManifest, Permission } from '../../shared/interfaces.js'
import type { Logger } from './types.js'

/** 全局策略文件结构（config/policies.json） */
export interface GlobalPolicies {
  /** 全局禁用的资源操作，如 [{ resource: "filesystem", action: "write" }] */
  denied?: Permission[]
  /** 默认是否允许（白名单模式 false / 黑名单模式 true） */
  defaultAllow?: boolean
  /** 每个模块的额外权限覆盖 */
  overrides?: Record<string, { allow?: Permission[]; deny?: Permission[] }>
}

/**
 * 策略引擎
 *
 * 职责：
 * 1. 加载全局策略（policies.json）
 * 2. 检查模块是否拥有某项权限
 *    - 模块 manifest 中声明的权限是"申请"
 *    - 全局策略可以全局拒绝或按模块覆盖
 */
export class PolicyEngine {
  private policies: GlobalPolicies = { defaultAllow: false }
  private readonly logger?: Logger

  constructor(options: { logger?: Logger } = {}) {
    this.logger = options.logger
  }

  /** 从文件加载全局策略 */
  async load(path: string): Promise<void> {
    try {
      const raw = await readFile(path, 'utf-8')
      this.policies = JSON.parse(raw) as GlobalPolicies
      this.logger?.log('kernel.policy', 'info', `Policies loaded from ${path}`)
    } catch (err) {
      this.logger?.log('kernel.policy', 'warn', `Failed to load policies from ${path}, using defaults`, {
        error: err instanceof Error ? err.message : String(err),
      })
      this.policies = { defaultAllow: false }
    }
  }

  /** 直接设置策略（测试用） */
  setPolicies(policies: GlobalPolicies): void {
    this.policies = policies
  }

  /**
   * 检查模块是否拥有某项权限
   *
   * 判定顺序：
   * 1. 全局 denied 命中 → 拒绝
   * 2. 模块级 override.deny 命中 → 拒绝
   * 3. 模块级 override.allow 命中 → 允许
   * 4. 模块 manifest 中声明了该权限 → 允许
   * 5. defaultAllow 兜底
   */
  check(manifest: ModuleManifest, permission: Permission): boolean {
    // 1. 全局拒绝
    if (this.policies.denied?.some((p) => this.matchPermission(p, permission))) {
      return false
    }

    const override = this.policies.overrides?.[manifest.id]

    // 2. 模块级拒绝
    if (override?.deny?.some((p) => this.matchPermission(p, permission))) {
      return false
    }

    // 3. 模块级允许
    if (override?.allow?.some((p) => this.matchPermission(p, permission))) {
      return true
    }

    // 4. manifest 声明
    if (manifest.permissions.some((p) => this.matchPermission(p, permission))) {
      return true
    }

    // 5. 兜底
    return this.policies.defaultAllow ?? false
  }

  /** 权限匹配：resource + action 必须匹配，scope 若都提供则需一致 */
  private matchPermission(granted: Permission, requested: Permission): boolean {
    if (granted.resource !== requested.resource) return false
    if (granted.action !== requested.action) return false
    if (granted.scope !== undefined && requested.scope !== undefined) {
      return granted.scope === requested.scope
    }
    return true
  }
}