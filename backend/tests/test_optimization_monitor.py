"""性能優化監控 API 測試。"""

from backend.services.optimization_monitor import collect_optimization_monitor


def test_collect_optimization_monitor_structure():
    data = collect_optimization_monitor()
    assert "roadmap" in data
    assert len(data["roadmap"]) == 9
    assert "stage_router" in data
    assert "generate" in data["stage_router"]
    assert "reflection" in data
    assert data["reflection"]["max_iterations"] >= 1
    assert "llm_cache" in data
    assert "hit_rate" in data["llm_cache"]
    assert "routing_feedback" in data
    assert "user_feedback" in data
    assert "edge_cache" in data
    assert "opc_edge" in data
    assert "system_stats" in data
    assert "trace" in data


def test_roadmap_priorities():
    data = collect_optimization_monitor()
    p0 = [r for r in data["roadmap"] if r["priority"] == "P0"]
    assert len(p0) == 3
    ids = {r["id"] for r in data["roadmap"]}
    assert "stage_router" in ids
    assert "dynamic_threshold" in ids
    assert "reflection_early_stop" in ids
    assert "user_feedback" in ids
    assert "merge_review_synth" in ids
    assert "edge_cache" in ids


def test_roadmap_has_metrics():
    data = collect_optimization_monitor()
    for item in data["roadmap"]:
        assert "metric" in item
        assert item["metric"]


def test_layered_cache_status_is_system_not_opc():
    data = collect_optimization_monitor()
    edge = data["edge_cache"]
    assert edge.get("source") == "llm_cache"
    assert "max_size" in edge
    assert "hit_rate" in edge
    assert "cache_path" not in edge
