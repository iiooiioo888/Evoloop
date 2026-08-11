"""EvoLoop 后端 FastAPI 入口。

启动方式：
    python -m backend.main
    uvicorn backend.main:app --host 0.0.0.0 --port 8000
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import asyncio
import json as json_mod

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.core.graph import MAX_ITERATIONS, PASS_THRESHOLD, evoloop_graph
from backend.core import nodes
from backend.core.llm import call_llm, call_llm_stream
from backend.core.llm_config import get_runtime_config, masked_key, save_runtime_config
from backend.services.dashboard import collect_dashboard
from backend.services.docker_manager import get_docker_manager
from backend.company.docker_tools import DOCKER_SERVICE_HOURLY_RATES
from backend.services.cloud_console import (
    get_cloud_alerts,
    get_cloud_billing,
    get_cloud_events,
    get_cloud_monitor,
)
from backend.services.task_broadcaster import task_broadcaster
from backend.services.task_manager import task_manager

# ═══════════════════════════════════════════════════════════════
# 全局公司預算狀態（由 orchestrator 更新，API 讀取）
# ═══════════════════════════════════════════════════════════════

_company_budget_state: dict[str, Any] = {
    "docker_cost": 0.0,
    "total_spent": 0.0,
    "budget_pressure": 0.0,
    "optimization_suggestions": [],
    "auto_optimized": {},
    "last_updated": "",
}


def update_company_budget_state(state: dict[str, Any]) -> None:
    """由公司 orchestrator 調用，更新全局預算狀態。"""
    global _company_budget_state
    _company_budget_state = {
        **state,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="EvoLoop Backend",
    description="EvoLoop AI 助手 — 反思闭环 + 多代理人公司运行时",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    query: str
    session_id: str | None = None
    # 統一模式：執行策略（auto / simple / company），預設 auto 自動判斷
    execution_strategy: str = "auto"
    company_template: str = "quick_task"
    # 多輪對話歷史：[{"role": "user"|"assistant", "content": "..."}, ...]
    history: list[dict[str, str]] = []


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    score: float | None = None
    iteration: int = 0


class LlmConfigRequest(BaseModel):
    api_key: str | None = None
    api_base: str | None = None
    model: str | None = None


class TaskRequest(BaseModel):
    query: str
    # 統一模式：執行策略（auto / simple / company），預設 auto 自動判斷
    execution_strategy: str = "auto"
    company_template: str = "quick_task"
    # 控制細項（進階參數）
    options: dict[str, Any] = {}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/config")
async def get_config():
    """回傳当前 LLM 配置（金鑰脱敏）。"""
    cfg = get_runtime_config()
    return {
        "configured": bool(cfg.get("api_key")),
        "api_key": masked_key(cfg.get("api_key", "")),
        "api_base": cfg.get("api_base", ""),
        "model": cfg.get("model", ""),
    }


@app.post("/config")
async def update_config(req: LlmConfigRequest):
    """動態更新 LLM 配置（即時生效並持久化）。"""
    save_runtime_config(api_key=req.api_key, api_base=req.api_base, model=req.model)
    logger.info("LLM 配置已更新（model=%s, api_base=%s）", req.model, req.api_base)
    return await get_config()


@app.post("/config/test")
async def test_config():
    """以当前配置實際呼叫 LLM 驗證連線。"""
    try:
        reply = call_llm("請用兩個字回覆：成功。", temperature=0)
        return {"ok": True, "reply": reply.strip()}
    except Exception as exc:
        logger.warning("LLM 連線測試失敗：%s", exc)
        return {"ok": False, "error": str(exc)[:300]}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """执行 EvoLoop 统一模式图（支援多輪對話歷史）。"""
    session_id = req.session_id or uuid.uuid4().hex[:12]
    initial_state = {
        "query": req.query,
        "session_id": session_id,
        "iteration": 0,
        "score": 0.0,
        "current_answer": "",
        "reflection": "",
        "memories": [],
        "history": req.history or [],
        "execution_strategy": req.execution_strategy,
        "company_template": req.company_template,
    }
    result = await evoloop_graph.ainvoke(initial_state)
    return ChatResponse(
        session_id=session_id,
        answer=result.get("current_answer", ""),
        score=result.get("score"),
        iteration=result.get("iteration", 0),
    )


# ==================== 串流聊天 API（SSE 打字機效果） ====================


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """SSE 串流聊天：即時推送階段進度與生成 token。

    事件格式（Server-Sent Events）：
      event: phase      → 階段切換 {"phase": "..."}
      event: token      → 生成片段 {"token": "..."}
      event: evaluation → 評分 {"score": n, "iteration": n}
      event: done       → 完成 {"answer": "...", "score": n, "iteration": n}
      event: error      → 錯誤 {"error": "..."}

    統一模式：複雜任務（公司運行時路徑）自動降級為同步 /chat。
    """
    from backend.core.company_nodes import _is_complex_task

    if req.execution_strategy == "company" or (
        req.execution_strategy == "auto" and _is_complex_task(req.query)
    ):
        # 公司運行時路徑流程複雜，降級為同步回傳
        result = await chat(req)
        async def single():
            yield f"event: done\ndata: {json_mod.dumps({'answer': result.answer, 'score': result.score, 'iteration': result.iteration}, ensure_ascii=False)}\n\n"
        return StreamingResponse(single(), media_type="text/event-stream")

    session_id = req.session_id or uuid.uuid4().hex[:12]

    async def event_stream():
        state: dict[str, Any] = {
            "query": req.query,
            "session_id": session_id,
            "history": req.history or [],
        }
        try:
            # 階段 1：記憶檢索
            yield f"event: phase\ndata: {json_mod.dumps({'phase': 'retrieve_memories'})}\n\n"
            state.update(await asyncio.to_thread(nodes.retrieve_memories, state))

            # 階段 2：生成回答（串流 token，Queue 橋接同步生成器與非同步迴圈）
            yield f"event: phase\ndata: {json_mod.dumps({'phase': 'generate'})}\n\n"
            from backend.prompts import templates
            gen_prompt = templates.GENERATE_INITIAL_ANSWER.format(
                query=state["query"],
                history_context=nodes._format_history(state.get("history", [])),
                memory_context=nodes._format_memories(state.get("retrieved_memories", [])),
            )
            loop = asyncio.get_running_loop()
            token_queue: asyncio.Queue[str | None] = asyncio.Queue()

            def _produce_tokens() -> None:
                try:
                    for token in call_llm_stream(gen_prompt, system=templates.GENERATE_INITIAL_ANSWER_SYSTEM):
                        loop.call_soon_threadsafe(token_queue.put_nowait, token)
                finally:
                    loop.call_soon_threadsafe(token_queue.put_nowait, None)

            asyncio.get_running_loop().run_in_executor(None, _produce_tokens)

            answer_parts: list[str] = []
            while True:
                token = await token_queue.get()
                if token is None:
                    break
                answer_parts.append(token)
                yield f"event: token\ndata: {json_mod.dumps({'token': token}, ensure_ascii=False)}\n\n"
            answer = "".join(answer_parts)
            state.update({"initial_answer": answer, "current_answer": answer, "iteration": 0})

            # 階段 3：評估
            yield f"event: phase\ndata: {json_mod.dumps({'phase': 'evaluate'})}\n\n"
            state.update(await asyncio.to_thread(nodes.evaluate_answer, state))
            yield f"event: evaluation\ndata: {json_mod.dumps({'score': state.get('score'), 'iteration': 0})}\n\n"

            # 反思/改進迴圈
            while (
                state.get("score", 0.0) < PASS_THRESHOLD
                and state.get("iteration", 0) < MAX_ITERATIONS
            ):
                yield f"event: phase\ndata: {json_mod.dumps({'phase': 'reflect', 'iteration': state.get('iteration', 0)})}\n\n"
                state.update(await asyncio.to_thread(nodes.reflect, state))

                yield f"event: phase\ndata: {json_mod.dumps({'phase': 'improve', 'iteration': state.get('iteration', 0)})}\n\n"
                state.update(await asyncio.to_thread(nodes.improve_answer, state))

                yield f"event: phase\ndata: {json_mod.dumps({'phase': 'evaluate'})}\n\n"
                state.update(await asyncio.to_thread(nodes.evaluate_answer, state))
                yield f"event: evaluation\ndata: {json_mod.dumps({'score': state.get('score'), 'iteration': state.get('iteration', 0)})}\n\n"

            final_answer = state.get("current_answer", "")
            # 儲存記憶（盡力而為）
            state["final_answer"] = final_answer
            await asyncio.to_thread(nodes.save_memory, state)

            yield f"event: done\ndata: {json_mod.dumps({'answer': final_answer, 'score': state.get('score'), 'iteration': state.get('iteration', 0)}, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001
            logger.error("串流聊天失敗：%s", exc)
            yield f"event: error\ndata: {json_mod.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ==================== 任務介面 API（後台執行 + 進度輪詢） ====================

@app.post("/tasks")
async def create_task(req: TaskRequest):
    """建立後台任務（統一模式），回傳 task_id 供輪詢。

    統一模式下不再區分模式，execution_strategy 僅為可選的強制指定：
    - "auto"（預設）: 系統自動判斷執行路徑
    - "simple": 強制單次 LLM 生成
    - "company": 強制公司運行時
    """
    if not req.query.strip():
        raise HTTPException(status_code=422, detail="query 不可為空")
    record = task_manager.create_task(
        req.query, req.execution_strategy, req.company_template, options=req.options
    )
    task_manager.start_task(record)
    return {"task_id": record.task_id, "strategy": req.execution_strategy}


@app.get("/tasks/{task_id}")
async def get_task(task_id: str):
    """查詢任務進度：狀態、階段、事件流、看板、預算與結果。"""
    record = task_manager.get_task(task_id)
    if record is None:
        raise HTTPException(status_code=404, detail="任務不存在")
    return record.to_dict()


@app.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    """請求取消執行中的任務。

    設置取消標誌，任務會在下一個檢查點中止。
    已完成/已失敗的任務無法取消。
    """
    ok, message = task_manager.cancel_task(task_id)
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.post("/tasks/{task_id}/resume")
async def resume_task(task_id: str):
    """斷點續跑：從檢查點恢復任務執行。

    僅支援公司模式任務（有 orchestrator checkpoint）。
    """
    ok, message = task_manager.resume_task(task_id)
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


# ==================== 思考過程軌跡 API ====================

from backend.services.trace_logger import (
    list_checkpoints,
    list_traces,
    load_checkpoint,
    read_trace,
)


@app.get("/tasks/{task_id}/trace")
async def get_task_trace(task_id: str, limit: int = 100, offset: int = 0):
    """獲取任務的思考過程記錄（分頁）。

    記錄內容：LLM 調用、上下文注入、評估、反思、改進、階段切換等。
    """
    events = await asyncio.to_thread(read_trace, task_id, limit, offset)
    return {"task_id": task_id, "offset": offset, "limit": limit, "events": events}


@app.get("/tasks/{task_id}/checkpoint")
async def get_task_checkpoint(task_id: str):
    """獲取任務的檢查點信息。"""
    checkpoint = await asyncio.to_thread(load_checkpoint, task_id)
    if checkpoint is None:
        return {"task_id": task_id, "exists": False}
    return {"task_id": task_id, "exists": True, "checkpoint": checkpoint}


@app.get("/traces")
async def get_traces(limit: int = 50):
    """列出所有思考過程軌跡檔案摘要。"""
    traces = await asyncio.to_thread(list_traces, limit)
    return {"traces": traces}


@app.get("/checkpoints")
async def get_checkpoints():
    """列出所有可恢復的檢查點。"""
    checkpoints = await asyncio.to_thread(list_checkpoints)
    return {"checkpoints": checkpoints}


@app.websocket("/tasks/{task_id}/ws")
async def task_websocket(websocket: WebSocket, task_id: str):
    """WebSocket 实时推送任务进度。

    客户端连接后自动订阅任务事件，收到消息格式：
    {"task_id": "...", "event": "phase_change|evaluation|task_finished|...", "data": {...}}

    任务完成/失败后发送 task_finished 事件，客户端可主动关闭连接。
    """
    # 检查任务是否存在
    record = task_manager.get_task(task_id)
    if record is None:
        await websocket.close(code=4004, reason="任务不存在")
        return

    await websocket.accept()
    await task_broadcaster.subscribe(task_id, websocket)

    try:
        # 发送当前状态作为初始快照
        await websocket.send_json({
            "task_id": task_id,
            "event": "snapshot",
            "data": record.to_dict(),
        })

        # 保持连接，等待客户端关闭或任务完成
        while True:
            try:
                # 接收客户端消息（心跳或关闭请求）
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_json({"task_id": task_id, "event": "pong", "data": {}})
                elif data == "close":
                    break
            except WebSocketDisconnect:
                break
    finally:
        await task_broadcaster.unsubscribe(task_id, websocket)


# ==================== 記憶庫管理 API ====================

from backend.memory.vector_store import VectorMemoryStore

_memory_store_api = VectorMemoryStore()


@app.get("/memories")
async def list_memories(limit: int = 50, offset: int = 0):
    """列出記憶庫中的記憶（分頁，按建立時間降序）。"""
    try:
        all_memories = await asyncio.to_thread(_memory_store_api.all)
        total = len(all_memories)
        all_memories.sort(
            key=lambda m: (m.get("metadata") or {}).get("created_at", ""),
            reverse=True,
        )
        page = all_memories[offset : offset + limit]
        return {"total": total, "offset": offset, "limit": limit, "memories": page}
    except Exception as exc:  # noqa: BLE001
        logger.warning("記憶庫讀取失敗：%s", exc)
        return {"total": 0, "offset": offset, "limit": limit, "memories": [], "error": str(exc)}


@app.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str):
    """刪除單條記憶。"""
    try:
        collection = await asyncio.to_thread(_memory_store_api._get_collection)
        collection.delete(ids=[memory_id])
        _memory_store_api.invalidate_cache()
        return {"deleted": True, "id": memory_id}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"刪除失敗：{exc}") from exc


@app.post("/memories/cleanup")
async def cleanup_memories(max_age_days: int = 30, min_score: float | None = None):
    """清理過期或低品質記憶。"""
    try:
        deleted = await asyncio.to_thread(
            _memory_store_api.cleanup, max_age_days, min_score
        )
        return {"deleted_count": deleted}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"清理失敗：{exc}") from exc


@app.get("/dashboard")
async def dashboard():
    """控制面版聚合資料：統計/任務/存檔/OPC 審計/能力註冊表。"""
    return collect_dashboard()


# ==================== Docker 容器管理 API ====================

@app.get("/docker/status")
async def docker_status():
    """獲取 Docker 容器狀態摘要（含按時計費費率）。"""
    dm = get_docker_manager()
    return {
        "available": dm.available,
        "containers": dm.list_containers(),
        "health": dm.health_check() if dm.available else {"_error": "Docker 不可用"},
        "hourly_rates": DOCKER_SERVICE_HOURLY_RATES,
    }


@app.get("/docker/budget")
async def docker_budget():
    """獲取 Docker 容器預算狀態（公司全權控制）。

    返回當前 Docker 成本、預算壓力、優化建議和自動優化記錄。
    """
    from backend.company.docker_tools import get_service_hourly_rate

    dm = get_docker_manager()

    # 計算當前容器運行成本
    services: list[dict[str, Any]] = []
    total_docker_cost = 0.0
    total_hourly_rate = 0.0

    if dm.available:
        for c in dm.list_containers():
            svc = c.get("service", c["name"])
            if svc == "_docker_unavailable":
                continue
            rate = get_service_hourly_rate(svc)
            uptime_s = float(c.get("uptime_seconds", 0))
            hours = uptime_s / 3600.0
            cost = rate * hours
            is_running = c.get("status", "").startswith("Up")
            services.append({
                "service": svc,
                "rate_per_hour": rate,
                "uptime_hours": round(hours, 2),
                "cost": round(cost, 4),
                "status": "running" if is_running else "stopped",
            })
            if is_running:
                total_docker_cost += cost
                total_hourly_rate += rate

    return {
        "available": dm.available,
        "services": services,
        "total_docker_cost": round(total_docker_cost, 4),
        "total_hourly_rate": round(total_hourly_rate, 4),
        "monthly_projection": round(total_hourly_rate * 24 * 30, 4),
        "company_budget": _company_budget_state,
    }


@app.get("/docker/containers")
async def docker_containers():
    """列出所有容器。"""
    dm = get_docker_manager()
    return {"containers": dm.list_containers()}


@app.get("/docker/logs/{service}")
async def docker_logs(service: str, tail: int = 100):
    """獲取指定服務的日誌。"""
    dm = get_docker_manager()
    logs = dm.get_container_logs(service, tail=tail)
    return {"service": service, "tail": tail, "logs": logs}


@app.get("/docker/stats")
async def docker_stats():
    """獲取容器資源使用統計。"""
    dm = get_docker_manager()
    return {"stats": dm.get_stats()}


@app.get("/docker/health")
async def docker_health():
    """檢查所有服務健康狀態。"""
    dm = get_docker_manager()
    return dm.health_check()


@app.post("/docker/restart/{service}")
async def docker_restart(service: str):
    """重啟指定服務。"""
    dm = get_docker_manager()
    return dm.restart_service(service)


@app.post("/docker/stop/{service}")
async def docker_stop(service: str):
    """停止指定服務。"""
    dm = get_docker_manager()
    return dm.stop_service(service)


@app.post("/docker/start/{service}")
async def docker_start(service: str):
    """啟動指定服務。"""
    dm = get_docker_manager()
    return dm.start_service(service)


# ==================== 雲控制台 API ====================


@app.get("/cloud/billing")
async def cloud_billing():
    """獲取雲端費用摘要。"""
    billing = get_cloud_billing()
    return billing.get_billing_summary()


@app.get("/cloud/monitoring")
async def cloud_monitoring(range: str = "1h"):
    """獲取資源監控歷史數據。

    Args:
        range: 時間範圍（1h / 6h / 24h）
    """
    range_map = {"1h": 1.0, "6h": 6.0, "24h": 24.0}
    hours = range_map.get(range, 1.0)
    monitor = get_cloud_monitor()
    return monitor.get_history(hours)


@app.get("/cloud/monitoring/latest")
async def cloud_monitoring_latest():
    """獲取最新資源快照。"""
    monitor = get_cloud_monitor()
    data = monitor.get_latest()
    if data is None:
        return {"services": {}, "ts": None}
    return data


@app.get("/cloud/events")
async def cloud_events(limit: int = 50):
    """獲取容器事件時間線。"""
    events = get_cloud_events()
    return {"events": events.get_events(limit)}


@app.get("/cloud/alerts")
async def cloud_alerts_list():
    """獲取告警規則列表。"""
    alerts = get_cloud_alerts()
    return {
        "rules": alerts.list_rules(),
        "history": alerts.get_alert_history(50),
    }


class AlertRuleCreate(BaseModel):
    name: str
    metric: str  # cpu / memory
    threshold: float
    service: str = "*"


@app.post("/cloud/alerts")
async def cloud_alerts_create(rule: AlertRuleCreate):
    """創建告警規則。"""
    alerts = get_cloud_alerts()
    return alerts.create_rule(
        name=rule.name,
        metric=rule.metric,
        threshold=rule.threshold,
        service=rule.service,
    )


@app.post("/cloud/alerts/{rule_id}/toggle")
async def cloud_alerts_toggle(rule_id: str):
    """切換告警規則啟用狀態。"""
    alerts = get_cloud_alerts()
    result = alerts.toggle_rule(rule_id)
    if result is None:
        raise HTTPException(status_code=404, detail="規則不存在")
    return result


@app.delete("/cloud/alerts/{rule_id}")
async def cloud_alerts_delete(rule_id: str):
    """刪除告警規則。"""
    alerts = get_cloud_alerts()
    if not alerts.delete_rule(rule_id):
        raise HTTPException(status_code=404, detail="規則不存在")
    return {"deleted": True}


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    port = int(os.getenv("BACKEND_PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
