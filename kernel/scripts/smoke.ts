// ━━━ kernel/scripts/smoke.ts ━━━
// 冒烟测试：启动内核 → 动态加载 llm-connector → 调用能力 → 关闭
// 运行：npx tsx kernel/scripts/smoke.ts

import { Kernel } from '../src/index.js'

async function main(): Promise<void> {
  const kernel = new Kernel({
    config: { modulesDir: 'modules', configDir: 'config', logLevel: 'debug' },
  })

  // 订阅所有事件（审计视角）
  kernel.eventBus.subscribe('*', async (e) => {
    console.log(`  [event] ${e.type} ← ${e.source}`)
  }, { ownerModuleId: 'audit', priority: 999 })

  console.log('━━━ Booting EvoLoop Kernel ━━━')
  await kernel.boot()

  console.log('\n━━━ Module Status ━━━')
  for (const m of kernel.admin.getAllModules()) {
    console.log(`  ${m.manifest.id} v${m.manifest.version}: ${m.status}`)
  }

  // 调用 llm-connector 能力
  const llm = kernel.registry.get('llm-connector') as
    | { call(prompt: string): Promise<string>; getStats(): unknown }
    | undefined

  if (llm) {
    console.log('\n━━━ Calling llm-connector ━━━')
    const response = await llm.call('Hello, EvoLoop!')
    console.log(`  response: ${response}`)
    console.log(`  stats: ${JSON.stringify(llm.getStats())}`)
  } else {
    console.error('llm-connector module not loaded!')
    process.exit(1)
  }

  // 权限检查演示
  console.log('\n━━━ Permission Check ━━━')
  const api = kernel.getAPI()
  console.log(`  llm:execute → ${api.checkPermission('llm-connector', { resource: 'llm', action: 'execute' })}`)
  console.log(`  filesystem:write → ${api.checkPermission('llm-connector', { resource: 'filesystem', action: 'write' })}`)

  // 依赖图
  console.log('\n━━━ Dependency Graph ━━━')
  const graph = kernel.admin.getDependencyGraph()
  console.log(`  startup order: ${graph.startupOrder.join(' → ') || '(empty)'}`)

  console.log('\n━━━ Shutdown ━━━')
  await kernel.shutdown()
  console.log('Done.')
}

main().catch((err) => {
  console.error('Smoke test failed:', err)
  process.exit(1)
})