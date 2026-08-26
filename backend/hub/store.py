"""進程內使用者 / 日誌 / 任務儲存（無 PostgreSQL 時的一期實作）。"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _crockford(n: int = 26) -> str:
    return "".join(CROCKFORD[b % 32] for b in secrets.token_bytes(n))


def new_task_id() -> str:
    return "agt_" + _crockford(26)


def new_chat_id() -> str:
    return "chatcmpl-" + secrets.token_hex(13)


def new_trace_id() -> str:
    return secrets.token_hex(16)


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass
class HubUser:
    id: UUID
    name: str
    api_key_hash: str
    monthly_budget_limit_usd: float = 100.0
    daily_budget_limit_usd: float = 10.0
    preferred_models: list[str] = field(default_factory=list)
    home_region: str = "ZZ"
    data_egress_ack: bool = False


@dataclass
class AgentTask:
    task_id: str
    user_id: UUID
    status: str
    input: str
    tools: list[str]
    cost_usd: float = 0.0
    result: dict[str, Any] | None = None
    error_code: str = ""
    error_detail: str = ""
    trace_id: str = ""
    chosen_provider: str = ""
    latency_ms: int = 0
    progress_pct: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = None


class HubStore:
    def __init__(self) -> None:
        self.users_by_hash: dict[str, HubUser] = {}
        self.users_by_id: dict[UUID, HubUser] = {}
        self.call_logs: list[dict[str, Any]] = []
        self.tasks: dict[str, AgentTask] = {}
        self.idempotency: dict[str, str] = {}
        self.provider_metrics: dict[str, dict[str, Any]] = {}
        self.seed_dev_user()
        self.seed_metrics()

    def seed_dev_user(self, api_key: str = "ak_live_hub_dev_key_for_local_only") -> HubUser:
        user = HubUser(
            id=UUID("00000000-0000-4000-8000-000000000001"),
            name="hub-dev",
            api_key_hash=hash_api_key(api_key),
            daily_budget_limit_usd=10.0,
            monthly_budget_limit_usd=100.0,
        )
        self.users_by_hash[user.api_key_hash] = user
        self.users_by_id[user.id] = user
        return user

    def add_user(self, user: HubUser) -> HubUser:
        self.users_by_hash[user.api_key_hash] = user
        self.users_by_id[user.id] = user
        return user

    def get_by_api_key(self, raw_key: str) -> HubUser | None:
        return self.users_by_hash.get(hash_api_key(raw_key))

    def append_log(self, row: dict[str, Any]) -> None:
        if "create_time" not in row:
            row["create_time"] = datetime.now(timezone.utc).isoformat()
        self.call_logs.append(row)
        if len(self.call_logs) > 2000:
            self.call_logs = self.call_logs[-1500:]

    def seed_metrics(self) -> None:
        from backend.hub.catalog import seed_default_metrics

        seed_default_metrics(self.provider_metrics)

    def reset(self) -> None:
        self.users_by_hash.clear()
        self.users_by_id.clear()
        self.call_logs.clear()
        self.tasks.clear()
        self.idempotency.clear()
        self.provider_metrics.clear()
        self.seed_dev_user()
        self.seed_metrics()


def new_user(
    name: str,
    api_key: str,
    daily_budget_limit_usd: float = 10.0,
    preferred_models: list[str] | None = None,
    data_egress_ack: bool = False,
) -> HubUser:
    return HubUser(
        id=uuid4(),
        name=name,
        api_key_hash=hash_api_key(api_key),
        daily_budget_limit_usd=daily_budget_limit_usd,
        preferred_models=preferred_models or [],
        data_egress_ack=data_egress_ack,
    )
