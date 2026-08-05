"""OPC 审计日志的 Pydantic 模型。"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditEntry(BaseModel):
    """审计日志条目。"""

    timestamp: datetime
    operation: str  # read / write
    tag_name: str
    value: Any = None
    reason: str = ""
    result: str = ""  # success / blocked / failed
    detail: str = ""