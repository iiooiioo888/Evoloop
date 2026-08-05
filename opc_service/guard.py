"""安全护栏模块（Task 7.2）。

在写入 OPC 标签前执行以下检查：
1. 白名单检查：确保目标标签在允许写入清单中
2. 边界检查：确保写入值在安全范围内

审计日志已独立至 opc_service/audit.py。
"""

import logging

from opc_service.config import settings

logger = logging.getLogger(__name__)


class WriteGuard:
    """OPC 写入操作的安全守门员。

    所有写入操作必须通过此类的检查，否则拒绝执行。
    """

    # ---- 白名单检查 ----

    def check_whitelist(self, tag_name: str) -> tuple[bool, str]:
        """检查标签是否在写入白名单中。

        Returns:
            (passed, message): 是否通过与原因说明
        """
        if not settings.write_whitelist:
            # 白名单为空表示不限制
            return True, "白名单未启用"

        for prefix in settings.write_whitelist:
            if tag_name.startswith(prefix) or prefix in tag_name:
                return True, f"标签 {tag_name} 在白名单中"
        return False, f"标签 {tag_name} 不在写入白名单中，已拒绝"

    # ---- 边界检查 ----

    def check_bounds(self, tag_name: str, value: float) -> tuple[bool, str]:
        """检查写入值是否在安全边界内。

        Returns:
            (passed, message): 是否通过与原因说明
        """
        for key, (lo, hi) in settings.write_bounds.items():
            if key.lower() in tag_name.lower():
                if lo <= value <= hi:
                    return True, f"值 {value} 在允许范围 [{lo}, {hi}] 内"
                return (
                    False,
                    f"值 {value} 超出标签 {tag_name} 的安全范围 [{lo}, {hi}]，已拒绝",
                )
        # 没有匹配的边界设定，默认允许
        return True, f"标签 {tag_name} 无边界限制，允许写入"

    # ---- 综合检查 ----

    def validate_write(self, tag_name: str, value: float) -> tuple[bool, str]:
        """综合检查：白名单 + 边界。

        Returns:
            (passed, message): 两个检查都通过才允许写入
        """
        whitelist_ok, whitelist_msg = self.check_whitelist(tag_name)
        if not whitelist_ok:
            return False, whitelist_msg

        bounds_ok, bounds_msg = self.check_bounds(tag_name, value)
        if not bounds_ok:
            return False, bounds_msg

        return True, f"标签 {tag_name} 写入 {value}：通过所有安全检查"


# 模块级单例
write_guard = WriteGuard()