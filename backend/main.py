"""EvoLoop 后端 FastAPI 入口。

启动方式：
    python -m backend.main
    uvicorn backend.main:app --host 0.0.0.0 --port 8000
"""

import logging
import os
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.core.graph import evoloop_graph
from backend.core.llm import call_llm
from backend.core.llm_config import get_runtime_config, masked_key, save_runtime_config
from backend.services.task_manager import task_manager

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
    mode = "company" if req.company_mode else "standard"
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


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    port = int(os.getenv("BACKEND_PORT", "8000"))
