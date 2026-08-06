"""审计日志模块 — 独立于安全护栏。

记录所有 OPC 读写操作至 JSONL 文件，以日期分割。
"""

import logging
from datetime import datetime, timezone

from opc_service.config import settings
from opc_service.models.audit import AuditEntry

logger = logging.getLogger(__name__)


class AuditLogger:
    """审计日志记录器。

    记录所有 OPC 读写操作至 JSONL 文件，以日期分割。
    """

    def __init__(self):
        self._dir = settings.audit_log_dir
        self._dir.mkdir(parents=True, exist_ok=True)

    def _log_path(self) -> str:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return str(self._dir / f"opc_audit_{date_str}.jsonl")

    def log(self, entry: AuditEntry) -> None:
        """写入一笔审计记录。"""
        try:
            line = entry.model_dump_json() + "\n"
            with open(self._log_path(), "a", encoding="utf-8") as f:
                f.write(line)
        except Exception:
            logger.exception("审计日志写入失败")

    def log_read(
        self, tag_name: str, value: object, result: str = "success"
    ) -> None:
        """记录读取操作。"""
        self.log(
            AuditEntry(
                timestamp=datetime.now(timezone.utc),
                operation="read",
                tag_name=tag_name,
                value=str(value) if value is not None else None,
                result=result,
            )
        )

    def log_write(
        self,
        tag_name: str,
        value: float,
        reason: str = "",
        result: str = "success",
        detail: str = "",
    ) -> None:
        """记录写入操作。"""
        self.log(
            AuditEntry(
                timestamp=datetime.now(timezone.utc),
                operation="write",
                tag_name=tag_name,
                value=value,
                reason=reason,
                result=result,
                detail=detail,
            )
        )


# 模块级单例
audit_logger = AuditLogger()