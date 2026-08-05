"""OPC 路由 — 标签浏览与列表。"""

import logging

from fastapi import APIRouter

from opc_service.client import opc_client
from opc_service.models import (
    BrowseRequest,
    BrowseResponse,
    TagInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["OPC 浏览"])


@router.get("/tags", response_model=BrowseResponse)
async def list_tags():
    """列出 OPC UA 服务器中所有可用标签。"""
    try:
        nodes = await opc_client.browse_nodes()
        tags = [TagInfo(**n) for n in nodes]
        return BrowseResponse(tags=tags)
    except Exception as exc:
        logger.exception("浏览标签失败")
        return BrowseResponse(tags=[], error=str(exc))


@router.post("/browse", response_model=BrowseResponse)
async def browse_nodes(req: BrowseRequest = BrowseRequest()):
    """浏览 OPC UA 服务器节点树。"""
    try:
        nodes = await opc_client.browse_nodes(req.path)
        tags = [TagInfo(**n) for n in nodes]
        return BrowseResponse(tags=tags)
    except Exception as exc:
        logger.exception("浏览节点失败")
        return BrowseResponse(tags=[], error=str(exc))