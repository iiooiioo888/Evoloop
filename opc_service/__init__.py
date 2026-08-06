"""OPC 工业数据微服务（Phase 7）。

完整的 OPC 功能模块，包含：
- 协议层：OPC UA 客户端、模拟服务器、安全护栏、审计日志
- 业务层：感知节点、诊断节点、执行节点、图编排
- 接口层：REST API + WebSocket 订阅

模块结构：
    models/      — Pydantic 请求/响应模型（按操作拆分）
    client/      — OPC UA 异步客户端（Mixin 组合）
    routes/      — API 路由（按端点拆分）
    simulator/   — 模拟 OPC 服务器（标签/服务器/异常）
    guard.py     — 安全护栏（白名单 + 边界检查）
    audit.py     — 审计日志
    config.py    — 配置
    app.py       — FastAPI 应用工厂
    main.py      — 入口
    state.py     — OPC 状态字段
    prompts.py   — 诊断 Prompt 模板
    sense.py     — 感知节点
    diagnose.py  — 诊断节点
    act.py       — 执行节点
    graph.py     — 图编排
"""