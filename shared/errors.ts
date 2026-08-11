// ━━━ shared/errors.ts ━━━
// 标准错误类型

/** 错误码枚举 */
export enum ErrorCode {
  MODULE_NOT_FOUND = 'MODULE_NOT_FOUND',
  MODULE_ALREADY_REGISTERED = 'MODULE_ALREADY_REGISTERED',
  MODULE_ALREADY_STARTED = 'MODULE_ALREADY_STARTED',
  MODULE_NOT_STARTED = 'MODULE_NOT_STARTED',
  INVALID_MODULE_STATE = 'INVALID_MODULE_STATE',
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
  MISSING_DEPENDENCY = 'MISSING_DEPENDENCY',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  CONFIG_VALIDATION_FAILED = 'CONFIG_VALIDATION_FAILED',
  EVENT_HANDLER_ERROR = 'EVENT_HANDLER_ERROR',
  MODULE_INIT_FAILED = 'MODULE_INIT_FAILED',
  MODULE_START_FAILED = 'MODULE_START_FAILED',
  MODULE_STOP_FAILED = 'MODULE_STOP_FAILED',
  HAS_DEPENDENTS = 'HAS_DEPENDENTS',
}

/** EvoLoop 基础错误类 */
export class EvoloopError extends Error {
  readonly code: ErrorCode
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'EvoloopError'
    this.code = code
    this.details = details
  }
}

/** 模块未找到 */
export class ModuleNotFoundError extends EvoloopError {
  constructor(moduleId: string) {
    super(ErrorCode.MODULE_NOT_FOUND, `Module not found: "${moduleId}"`, { moduleId })
    this.name = 'ModuleNotFoundError'
  }
}

/** 模块重复注册 */
export class ModuleAlreadyRegisteredError extends EvoloopError {
  constructor(moduleId: string) {
    super(ErrorCode.MODULE_ALREADY_REGISTERED, `Module already registered: "${moduleId}"`, {
      moduleId,
    })
    this.name = 'ModuleAlreadyRegisteredError'
  }
}

/** 非法模块状态转换 */
export class InvalidModuleStateError extends EvoloopError {
  constructor(moduleId: string, currentState: string, attemptedAction: string) {
    super(
      ErrorCode.INVALID_MODULE_STATE,
      `Module "${moduleId}" is in state "${currentState}", cannot ${attemptedAction}`,
      { moduleId, currentState, attemptedAction },
    )
    this.name = 'InvalidModuleStateError'
  }
}

/** 循环依赖 */
export class CircularDependencyError extends EvoloopError {
  constructor(cycle: string[]) {
    super(ErrorCode.CIRCULAR_DEPENDENCY, `Circular dependency detected: ${cycle.join(' → ')}`, {
      cycle,
    })
    this.name = 'CircularDependencyError'
  }
}

/** 依赖缺失 */
export class MissingDependencyError extends EvoloopError {
  constructor(moduleId: string, missing: string[]) {
    super(
      ErrorCode.MISSING_DEPENDENCY,
      `Module "${moduleId}" has missing dependencies: ${missing.join(', ')}`,
      { moduleId, missing },
    )
    this.name = 'MissingDependencyError'
  }
}

/** 权限拒绝 */
export class PermissionDeniedError extends EvoloopError {
  constructor(moduleId: string, resource: string, action: string) {
    super(
      ErrorCode.PERMISSION_DENIED,
      `Permission denied for module "${moduleId}": ${action} on ${resource}`,
      { moduleId, resource, action },
    )
    this.name = 'PermissionDeniedError'
  }
}

/** 配置校验失败 */
export class ConfigValidationError extends EvoloopError {
  constructor(moduleId: string, issues: string[]) {
    super(
      ErrorCode.CONFIG_VALIDATION_FAILED,
      `Config validation failed for module "${moduleId}": ${issues.join('; ')}`,
      { moduleId, issues },
    )
    this.name = 'ConfigValidationError'
  }
}

/** 模块存在依赖者，无法停止 */
export class HasDependentsError extends EvoloopError {
  constructor(moduleId: string, dependents: string[]) {
    super(
      ErrorCode.HAS_DEPENDENTS,
      `Module "${moduleId}" cannot be stopped: depended upon by ${dependents.join(', ')}`,
      { moduleId, dependents },
    )
    this.name = 'HasDependentsError'
  }
}