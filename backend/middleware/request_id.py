"""全鏈路 Request-ID 中間件（P2 可觀測性）。

為所有 HTTP 請求生成或透傳 X-Request-Id，並在回應標頭回寫
X-Request-Id / X-Trace-Id，便於監控面板與 Trace 日誌關聯。
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


def get_request_id() -> str:
    """取得當前請求的 Request-ID（無則回空字串）。"""
    return _request_id_ctx.get()


def trace_id_from_request(request_id: str) -> str:
    """將 UUID 轉為 32 字元 Trace ID（與 Hub API 一致）。"""
    return request_id.replace("-", "")[:32].ljust(32, "0")


class RequestIdMiddleware(BaseHTTPMiddleware):
    """讀取或生成 X-Request-Id，注入 request.state 與 contextvar。"""

    async def dispatch(self, request: Request, call_next) -> Response:
        incoming = (request.headers.get("x-request-id") or "").strip()
        request_id = incoming or str(uuid.uuid4())
        token = _request_id_ctx.set(request_id)
        request.state.request_id = request_id
        try:
            response = await call_next(request)
        finally:
            _request_id_ctx.reset(token)
        response.headers["X-Request-Id"] = request_id
        response.headers["X-Trace-Id"] = trace_id_from_request(request_id)
        return response
