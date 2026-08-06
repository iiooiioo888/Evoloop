"""OPC 路由 — 标签写入（含安全护栏检查）。"""

import logging

from fastapi import APIRouter

from opc_service.audit import audit_logger
from opc_service.client import opc_client
from opc_service.guard import write_guard
from opc_service.models import (
    WriteRequest,
    WriteResponse,
    WriteResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["OPC 写入"])


@router.post("/write", response_model=WriteResponse)
async def write_tags(req: WriteRequest):
    """写入标签值，写入前通过安全护栏检查。

    安全检查流程：
    1. 白名单检查 → 2. 边界检查 → 3. 执行写入 → 4. 审计记录
    """
    results: list[WriteResult] = []

    for entry in req.entries:
        # 安全护栏检查
        passed, guard_msg = write_guard.validate_write(
            entry.tag_name, entry.value
        )
        if not passed:
            results.append(
                WriteResult(
                    tag_name=entry.tag_name,
                    success=False,
                    message=guard_msg,
                )
            )
            audit_logger.log_write(
                entry.tag_name,
                entry.value,
                reason=req.reason,
                result="blocked",
                detail=guard_msg,
            )
            continue

        # 执行写入
        try:
            result = await opc_client.write_node(
                entry.tag_name, entry.value
            )
            results.append(WriteResult(**result))
            audit_logger.log_write(
                entry.tag_name,
                entry.value,
                reason=req.reason,
                result="success" if result["success"] else "failed",
                detail=result.get("message", ""),
            )
        except Exception as exc:  # noqa: BLE001 - 逐项隔离：单项失败不影响其余写入，并记录审计
            results.append(
                WriteResult(
                    tag_name=entry.tag_name,
                    success=False,
                    message=str(exc),
                )
            )
            audit_logger.log_write(
                entry.tag_name,
                entry.value,
                reason=req.reason,
                result="failed",
                detail=str(exc),
            )

    return WriteResponse(results=results)