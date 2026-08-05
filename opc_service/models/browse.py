"""OPC 浏览操作的 Pydantic 请求/响应模型。"""

from typing import Any

from pydantic import BaseModel, Field


class BrowseRequest(BaseModel):
    """浏览 OPC UA 节点请求。"""

    path: str = Field(default="Objects", description="浏览起始路径")


class TagInfo(BaseModel):
    """标签信息。"""

    tag_name: str
    node_id: str
    data_type: str = ""
    value: Any = None
    writable: bool = False
    description: str = ""


class BrowseResponse(BaseModel):
    """浏览响应。"""

    tags: list[TagInfo]
    error: str | None = None