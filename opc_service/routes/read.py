"""OPC 路由 — 标签读取。"""

import logging

from fastapi import APIRouter

from opc_service.audit import audit_logger
from opc_service.client import opc_client
from opc_service.models import (
    ReadRequest,
    ReadResponse,
    TagValue,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["OPC 读取"])


@router.post("/read", response_model=ReadResponse)
async def read_tags(req: ReadRequest):
    """读取一个或多个标签的当前值。"""
    try:
        results = await opc_client.read_nodes(req.tag_names)
        tags = [TagValue(**r) for r in results]
        # 审计日志
        for tag in tags:
            audit_logger.log_read(tag.tag_name, tag.value)
        return ReadResponse(tags=tags)
    except Exception as exc:
        logger.exception("读取标签失败")
        return ReadResponse(tags=[], error=str(exc))