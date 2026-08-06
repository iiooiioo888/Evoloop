"""OPC 读取操作的 Pydantic 请求/响应模型。"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ReadRequest(BaseModel):
    """读取单一或多个标签的请求。"""

    tag_names: list[str] = Field(
        ..., min_length=1, max_length=50, description="要读取的标签名称列表"
    )


class TagValue(BaseModel):
    """单一标签的读取值。"""

    tag_name: str
    value: Any
    data_type: str = ""
    source_timestamp: datetime | None = None
    quality: str = "Good"


class ReadResponse(BaseModel):
    """读取响应。"""

    tags: list[TagValue]
    error: str | None = None