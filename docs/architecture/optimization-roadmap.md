# 性能优化路线图

本文档记录 EvoLoop 性能与成本优化的优先级、实现状态与配置项。

## 优先级总览

| 优先级 | 优化项 | 预期收益 | 状态 |
|--------|--------|----------|------|
| **P0** | 任务-模型匹配（不同环节用不同规模模型） | 成本降低 40–60% | ✅ 已实现 |
| **P0** | 反思早停机制 | 避免无效调用，延迟降低 | ✅ 已实现 |
| **P1** | Reviewer + Synthesizer 合并 | 延迟降低 ~25% | ✅ 已实现 |
| **P1** | 分层缓存 | 命中率提升 | ✅ 已实现 |
| **P2** | 路由自适应反馈 | 长期质量提升 | ✅ 已实现 |
| **P2** | OPC UA 边缘-云分层 | 工业场景延迟可控 | ✅ 已实现 |
| **P3** | 可观测性全链路 trace | 为后续优化提供数据基础 | ✅ 已实现 |

---

## P0：任务-模型匹配

**模块**：`backend/core/stage_router.py`

反思闭环各环节自动选择不同 `BudgetTier`：

| 环节 | 默认 Tier | 说明 |
|------|-----------|------|
| generate / improve | ROUTINE | 日常生成 |
| evaluate / cross_eval | SUMMARY | 最便宜，适合评分 |
| reflect | REASONING | 根因分析需较强推理 |

**环境变量**（可选覆盖）：

```env
EVOL_STAGE_TIER_GENERATE=routine
EVOL_STAGE_TIER_EVALUATE=summary
EVOL_STAGE_TIER_REFLECT=reasoning
EVOL_STAGE_TIER_IMPROVE=routine
```

公司运行时工作项级别路由见 `backend/company/budget.py` → `TierRouter`。

---

## P0：反思早停

**模块**：`backend/core/graph.py` → `should_improve`

终止条件（任一满足即 finalize）：

1. 分数 ≥ `EVOL_PASS_THRESHOLD`（默认 8）
2. 迭代次数 ≥ `EVOL_MAX_ITERATIONS`（默认 3）
3. 分数提升 < `EVOL_MIN_SCORE_IMPROVEMENT`（默认 0.5）

详见 [reflection-loop.md](./reflection-loop.md)。

---

## P1：Reviewer + Synthesizer 合并

**模块**：`backend/company/orchestrator.py` → `_review_and_synthesize`

公司运行时阶段 3 默认启用合并模式：单次 LLM 完成交付物审查 + 整合，减少一次 API 往返。

```env
EVOL_MERGE_REVIEW_SYNTH=true   # 默认 true；设为 false 恢复分离流程
```

---

## P1：分层缓存

| 层级 | 模块 | 说明 |
|------|------|------|
| LLM 精确 + 语义 | `backend/core/llm_cache.py` | 反思循环 prompt 复用 |
| Hub 语义 | `backend/hub/cache.py` | AI Hub 对话缓存 |
| 任务拆分 | `backend/company/decomposer.py` | 分解结果 LRU |

```env
EVOL_LLM_CACHE_SIZE=512
EVOL_SEMANTIC_CACHE=true
EVOL_SEMANTIC_THRESHOLD=0.92
EVOL_DECOMPOSE_CACHE_SIZE=64
```

---

## P2：路由自适应反馈

**模块**：`backend/core/routing_feedback.py`

`route_by_complexity` 根据历史 simple/company 路由结果与最终分数，动态调整复杂任务字数门槛。

- simple 路由低分（<6）多次 → 提高门槛，更早走 company
- company 路由高分且 query 短 → 略降门槛

数据存储：`backend/data/routing_feedback.json`

```env
EVOL_ROUTING_FEEDBACK_PATH=backend/data/routing_feedback.json
EVOL_ROUTING_LENGTH_BIAS=0
```

---

## P2：OPC UA 边缘-云分层

**模块**：`opc_service/sense.py`

| 模式 | 行为 |
|------|------|
| `auto` | 边缘缓存 TTL 内复用，否则云拉取 |
| `edge` | 仅使用本地缓存 |
| `cloud` | 始终 HTTP 拉取 OPC 微服务 |

```env
EVOL_OPC_TIER=auto
EVOL_OPC_EDGE_TTL=5
EVOL_OPC_EDGE_CACHE=opc_service/data/edge_cache.json
```

---

## P3：全链路 trace

**模块**：

- `backend/services/trace_logger.py` — 任务级 JSONL 轨迹
- `backend/core/pipeline_trace.py` — LangGraph 节点事件

节点在 `session_id` / `task_id` 存在时自动写入 trace，供监控面板与后续分析使用。

---

## 相关文档

- [反思闭环](./reflection-loop.md)
- [公司运行时](./company-runtime.md)
- [OPC 整合](./opc-integration.md)
