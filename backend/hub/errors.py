"""Hub RFC 7807 問題詳情。"""

from __future__ import annotations

from typing import Any


class HubError(Exception):
    """可轉成 application/problem+json 的業務錯誤。"""

    def __init__(
        self,
        status: int,
        code: str,
        detail: str,
        title: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail[:80]
        self.title = title or code.replace("_", " ").title()
        self.headers = headers or {}

    def to_problem(self) -> dict[str, Any]:
        return {
            "type": f"https://hub.example.com/errors/{self.code}",
            "title": self.title,
            "status": self.status,
            "code": self.code,
            "detail": self.detail,
        }


MSG_BUDGET = "今日預算不足，已攔截本次呼叫。請充值或將 x-routing-strategy 改為 cost_first 後重試。"
MSG_FILTER = "生成內容不符合社區規範，請修改問題"
MSG_EGRESS = "依資料合規要求，已限制為境內模型。請改用 DeepSeek 或 Qwen。"
MSG_UNSUPPORTED = "不支援的模型。請改用 gpt-5.6-sol 或 gemini-3.1-pro。"
MSG_TIMEOUT = "上游回應逾時，請稍後重試。"
MSG_FAILOVER_OK = "當前高峰期，已為您切換至備用高速通道"
MSG_ALL_DOWN = "模型服務暫時繁忙，請稍後再試。"
MSG_FAILOVER_HINT = "當前高峰期，已為您切換至備用高速通道"
