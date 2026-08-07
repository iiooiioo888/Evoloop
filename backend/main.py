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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.core.graph import evoloop_graph
from backend.core.llm import call_llm
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
    company_mode: bool = False
    company_template: str = "quick_task"


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
    company_mode: bool = False
    company_template: str = "quick_task"
    opc_mode: bool = False


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
    """执行 EvoLoop 反思闭环图。"""
    session_id = req.session_id or uuid.uuid4().hex[:12]
    initial_state = {
        "query": req.query,
        "session_id": session_id,
        "iteration": 0,
        "score": 0.0,
        "current_answer": "",
        "reflection": "",
        "memories": [],
        "company_mode": req.company_mode,
        "company_template": req.company_template,
    }
    result = await evoloop_graph.ainvoke(initial_state)
    return ChatResponse(
        session_id=session_id,
        answer=result.get("current_answer", ""),
        score=result.get("score"),
        iteration=result.get("iteration", 0),
    )


# ==================== 任務介面 API（後台執行 + 進度輪詢） ====================

@app.post("/tasks")
async def create_task(req: TaskRequest):
    """建立後台任務（標準/公司模式），回傳 task_id 供輪詢。"""
    if not req.query.strip():
        raise HTTPException(status_code=422, detail="query 不可為空")
    if req.opc_mode:
        mode = "opc"
    elif req.company_mode:
        mode = "company"
    else:
        mode = "standard"
    record = task_manager.create_task(req.query, mode, req.company_template)
    task_manager.start_task(record)
    return {"task_id": record.task_id, "mode": mode}


@app.get("/tasks/{task_id}")
async def get_task(task_id: str):
    """查詢任務進度：狀態、階段、事件流、看板、預算與結果。"""
    record = task_manager.get_task(task_id)
    if record is None:
        raise HTTPException(status_code=404, detail="任務不存在")
    return record.to_dict()


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
