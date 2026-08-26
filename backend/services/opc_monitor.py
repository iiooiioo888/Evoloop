"""OPC 監控中心聚合：護欄設定 + 審計 + 即時標籤（經 opc_service REST）。

前端不得直連 OPC UA；本模組只打 opc_service HTTP，寫入仍必須走 guard.py。
opc_service 不可達時降級為離線快照，不拋錯。
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from backend.services.dashboard import collect_opc_audit
from backend.services.task_manager import task_manager
from opc_service.config import settings

logger = logging.getLogger(__name__)

OPC_SERVICE_URL = os.getenv("OPC_SERVICE_URL", "http://127.0.0.1:8001").rstrip("/")
LIVE_TIMEOUT = httpx.Timeout(2.0, connect=1.0)

# 與 opc_service/simulator/tags.py 對齊；不 import simulator 套件以免拉進 asyncua
_TAG_CATALOG: list[dict[str, Any]] = [
    {"name": "Temperature", "unit": "°C", "desc": "反應槽溫度", "range": [0.0, 150.0]},
    {"name": "Pressure", "unit": "kPa", "desc": "管線壓力", "range": [0.0, 500.0]},
    {"name": "FlowRate", "unit": "L/min", "desc": "冷卻水流量", "range": [0.0, 1000.0]},
    {"name": "ValvePosition", "unit": "%", "desc": "控制閥開度", "range": [0.0, 100.0]},
    {"name": "MotorSpeed", "unit": "RPM", "desc": "主馬達轉速", "range": [0.0, 3000.0]},
    {"name": "Level", "unit": "%", "desc": "儲槽液位", "range": [0.0, 100.0]},
    {"name": "AlarmStatus", "unit": "", "desc": "警報狀態（0=正常, 1=警報）", "range": [0.0, 1.0]},
    {"name": "PowerConsumption", "unit": "kW", "desc": "設備總功耗", "range": [0.0, 200.0]},
]


def _guard_payload() -> dict[str, Any]:
    bounds = {
        key: {"min": lo, "max": hi} for key, (lo, hi) in settings.write_bounds.items()
    }
    return {
        "write_whitelist": sorted(settings.write_whitelist),
        "write_bounds": bounds,
        "require_approval": settings.require_approval,
        "sim_enabled": settings.sim_enabled,
        "opc_server": settings.opc_server_url,
    }


def _catalog_payload() -> list[dict[str, Any]]:
    writable_keys = set(settings.write_bounds)
    return [
        {
            "name": tag["name"],
            "unit": tag["unit"],
            "desc": tag["desc"],
            "range": list(tag["range"]),
            "writable": tag["name"] in writable_keys,
        }
        for tag in _TAG_CATALOG
    ]


def _recent_opc_tasks(limit: int = 8) -> list[dict[str, Any]]:
    records = [
        rec
        for rec in task_manager.tasks.values()
        if rec.resolved_path == "opc" or rec.opc_state
    ]
    records.sort(key=lambda r: r.created_at, reverse=True)
    out: list[dict[str, Any]] = []
    for rec in records[:limit]:
        data = rec.to_dict()
        data.pop("events", None)
        data.pop("kanban", None)
        out.append(data)
    return out


def fetch_opc_live(base_url: str | None = None) -> dict[str, Any]:
    """打 opc_service：health → tags → read。失敗回傳 reachable=false。"""
    url = (base_url or OPC_SERVICE_URL).rstrip("/")
    empty: dict[str, Any] = {
        "reachable": False,
        "health": None,
        "browse_tags": [],
        "readings": [],
        "error": None,
    }
    try:
        with httpx.Client(timeout=LIVE_TIMEOUT) as client:
            health_resp = client.get(f"{url}/opc/health")
            health_resp.raise_for_status()
            health = health_resp.json()
            tags_resp = client.get(f"{url}/opc/tags")
            tags_payload = tags_resp.json() if tags_resp.is_success else {"tags": []}
            browse = tags_payload.get("tags") or []
            names = [t.get("tag_name") for t in browse if t.get("tag_name")]
            readings: list[dict[str, Any]] = []
            if names:
                read_resp = client.post(
                    f"{url}/opc/read", json={"tag_names": names[:50]}
                )
                if read_resp.is_success:
                    readings = read_resp.json().get("tags") or []
            return {
                "reachable": True,
                "health": health if isinstance(health, dict) else {},
                "browse_tags": browse,
                "readings": readings,
                "error": tags_payload.get("error"),
            }
    except Exception as exc:  # noqa: BLE001 — 監控降級，不得讓控制面崩潰
        logger.info("opc_service 即時資料不可達：%s", exc)
        empty["error"] = str(exc)[:300]
        return empty


def collect_opc_monitor() -> dict[str, Any]:
    """監控中心 OPC 分頁的完整快照。"""
    live = fetch_opc_live()
    return {
        "guard": _guard_payload(),
        "catalog": _catalog_payload(),
        "audit": collect_opc_audit(),
        "live": live,
        "recent_tasks": _recent_opc_tasks(),
        "service_url": OPC_SERVICE_URL,
    }
