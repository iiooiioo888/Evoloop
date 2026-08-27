"""性能優化監控聚合（P0–P3 路線圖可觀測性）。

供 GET /monitor/optimization 使用，彙總各優化模組的運行時狀態與指標。
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

from backend.core.graph import MAX_ITERATIONS, MIN_SCORE_IMPROVEMENT, PASS_THRESHOLD
from backend.core.llm_cache import get_llm_cache
from backend.core.routing_feedback import routing_stats
from backend.core.stage_router import stage_tier, resolve_stage_model


def _cache_hit_rate(stats: dict[str, int]) -> float:
    total = stats.get("hits", 0) + stats.get("misses", 0)
    if total <= 0:
        return 0.0
    return round(stats["hits"] / total, 4)


def _opc_edge_status() -> dict[str, Any]:
    tier = os.getenv("EVOL_OPC_TIER", "auto").lower()
    ttl = float(os.getenv("EVOL_OPC_EDGE_TTL", "5"))
    cache_path = Path(
        os.getenv(
            "EVOL_OPC_EDGE_CACHE",
            str(Path(__file__).resolve().parents[2] / "opc_service" / "data" / "edge_cache.json"),
        )
    )
    age_sec: float | None = None
    reading_count = 0
    if cache_path.exists():
        try:
            import json

            data = json.loads(cache_path.read_text(encoding="utf-8"))
            updated = float(data.get("updated_at") or 0)
            if updated > 0:
                age_sec = round(time.time() - updated, 1)
            readings = data.get("readings") or {}
            if isinstance(readings, dict):
                reading_count = len(readings)
        except Exception:
            pass
    fresh = age_sec is not None and age_sec <= ttl
    return {
        "tier": tier,
        "edge_ttl_sec": ttl,
        "cache_path": str(cache_path),
        "cache_age_sec": age_sec,
        "cache_fresh": fresh,
        "reading_count": reading_count,
    }


def _trace_summary() -> dict[str, Any]:
    try:
        from backend.services.trace_logger import list_traces

        traces = list_traces(limit=200)
        return {"trace_count": len(traces), "recent": traces[:5]}
    except Exception:
        return {"trace_count": 0, "recent": []}


def _stage_routing() -> dict[str, Any]:
    stages = ["generate", "evaluate", "reflect", "improve", "cross_eval", "decompose"]
    mapping: dict[str, dict[str, str]] = {}
    for stage in stages:
        tier = stage_tier(stage)  # type: ignore[arg-type]
        try:
            model = resolve_stage_model(stage)  # type: ignore[arg-type]
        except Exception:
            model = "—"
        mapping[stage] = {"tier": tier.value, "model": model}
    return mapping


def collect_optimization_monitor() -> dict[str, Any]:
    """聚合性能優化路線圖各項指標（唯讀、降級安全）。"""
    cache_stats = get_llm_cache().stats
    routing = routing_stats()
    hit_rate = _cache_hit_rate(cache_stats)

    merge_enabled = os.getenv("EVOL_MERGE_REVIEW_SYNTH", "true").lower() == "true"
    semantic_on = os.getenv("EVOL_SEMANTIC_CACHE", "true").lower() == "true"

    stage_mapping = _stage_routing()
    trace_summary = _trace_summary()
    opc_status = _opc_edge_status()
    reflection_cfg = {
        "pass_threshold": PASS_THRESHOLD,
        "max_iterations": MAX_ITERATIONS,
        "min_score_improvement": MIN_SCORE_IMPROVEMENT,
    }

    roadmap = [
        {
            "priority": "P0",
            "id": "stage_router",
            "label": "任務-模型匹配",
            "benefit": "成本降低 40–60%",
            "enabled": True,
            "status": "active",
            "metric": f"{len(stage_mapping)} 環節已路由",
        },
        {
            "priority": "P0",
            "id": "reflection_early_stop",
            "label": "反思早停機制",
            "benefit": "避免無效呼叫、降低延遲",
            "enabled": True,
            "status": "active",
            "metric": (
                f"門檻 {reflection_cfg['pass_threshold']} · "
                f"Δ{reflection_cfg['min_score_improvement']} · "
                f"≤{reflection_cfg['max_iterations']} 輪"
            ),
        },
        {
            "priority": "P1",
            "id": "merge_review_synth",
            "label": "Reviewer + Synthesizer 合併",
            "benefit": "延遲降低 ~25%",
            "enabled": merge_enabled,
            "status": "active" if merge_enabled else "disabled",
            "metric": "合併模式" if merge_enabled else "分離模式",
        },
        {
            "priority": "P1",
            "id": "layered_cache",
            "label": "分層快取",
            "benefit": "命中率提升",
            "enabled": True,
            "status": "active",
            "metric": f"命中 {hit_rate * 100:.0f}% · {cache_stats.get('hits', 0)} 次",
        },
        {
            "priority": "P2",
            "id": "routing_feedback",
            "label": "路由自適應反饋",
            "benefit": "長期品質提升",
            "enabled": routing.get("total", 0) >= 0,
            "status": "learning" if routing.get("total", 0) < 10 else "active",
            "metric": (
                f"門檻 {routing.get('adaptive_length_threshold', '—')} · "
                f"n={routing.get('total', 0)}"
            ),
        },
        {
            "priority": "P2",
            "id": "opc_edge",
            "label": "OPC UA 邊緣-雲分層",
            "benefit": "工業場景延遲可控",
            "enabled": True,
            "status": "active",
            "metric": (
                f"{'邊緣快取' if opc_status.get('cache_fresh') else '雲端拉取'} · "
                f"{opc_status.get('reading_count', 0)} 標籤"
            ),
        },
        {
            "priority": "P3",
            "id": "pipeline_trace",
            "label": "全鏈路 trace",
            "benefit": "為後續優化提供數據基礎",
            "enabled": True,
            "status": "active",
            "metric": f"{trace_summary.get('trace_count', 0)} 筆軌跡",
        },
    ]

    return {
        "roadmap": roadmap,
        "stage_router": stage_mapping,
        "reflection": reflection_cfg,
        "merge_review_synth": {"enabled": merge_enabled},
        "llm_cache": {
            **cache_stats,
            "hit_rate": hit_rate,
            "semantic_enabled": semantic_on,
            "max_size": int(os.getenv("EVOL_LLM_CACHE_SIZE", "512")),
        },
        "routing_feedback": routing,
        "opc_edge": opc_status,
        "trace": trace_summary,
    }
