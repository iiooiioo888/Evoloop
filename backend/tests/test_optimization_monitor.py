"""性能優化監控 API 測試。"""

from backend.services.optimization_monitor import collect_optimization_monitor


def test_collect_optimization_monitor_structure():
    data = collect_optimization_monitor()
    assert "roadmap" in data
    assert len(data["roadmap"]) == 7
    assert "stage_router" in data
    assert "generate" in data["stage_router"]
    assert "reflection" in data
    assert data["reflection"]["max_iterations"] >= 1
    assert "llm_cache" in data
    assert "hit_rate" in data["llm_cache"]
    assert "routing_feedback" in data
    assert "opc_edge" in data
    assert "trace" in data


def test_roadmap_priorities():
    data = collect_optimization_monitor()
    p0 = [r for r in data["roadmap"] if r["priority"] == "P0"]
    assert len(p0) == 2
    ids = {r["id"] for r in data["roadmap"]}
    assert "stage_router" in ids
    assert "reflection_early_stop" in ids
    assert "merge_review_synth" in ids


def test_roadmap_has_metrics():
    data = collect_optimization_monitor()
    for item in data["roadmap"]:
        assert "metric" in item
        assert item["metric"]
