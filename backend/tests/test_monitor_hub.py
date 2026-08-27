"""監控 Hub 彙總快照單元測試。"""

from backend.services.monitor_hub import collect_monitor_hub


def test_collect_monitor_hub_structure():
    data = collect_monitor_hub()
    assert "generated_at" in data
    assert "agents" in data
    assert "optimization" in data
    assert "opc" in data
    assert "llm_ops" in data
    assert "errors" in data
    assert isinstance(data["errors"], list)
