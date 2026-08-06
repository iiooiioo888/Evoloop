"""OPC 写入操作的 Pydantic 请求/响应模型。"""

from pydantic import BaseModel, Field


class WriteEntry(BaseModel):
    """单一写入项目。"""

    tag_name: str = Field(..., description="标签名称（如 Temperature）")
    value: float = Field(..., description="写入值")


class WriteRequest(BaseModel):
    """写入请求。"""

    entries: list[WriteEntry] = Field(..., min_length=1, max_length=20)
    reason: str = Field(default="", description="操作原因（审计用）")


class WriteResult(BaseModel):
    """单一写入结果。"""

    tag_name: str
    success: bool
    message: str = ""
    written_value: float | None = None


class WriteResponse(BaseModel):
    """写入响应。"""

    results: list[WriteResult]
    approved: bool = True
    error: str | None = None