"""單一廠商鎖定 + 通用端點爬取模型目錄。"""

from __future__ import annotations

from backend.core.llm_config import reset_runtime_config, save_runtime_config
from backend.core.provider_pool import (
    classify_provider,
    clamp_model,
    models_endpoint,
    parse_models_payload,
    refresh_model_catalog,
)
from backend.services.task_manager import task_manager


def test_classify_deepseek_and_openrouter():
    assert classify_provider("https://api.deepseek.com", "gpt-4o") == "deepseek"
    assert classify_provider("https://openrouter.ai/api/v1", "") == "openrouter"
    assert classify_provider("https://dashscope.aliyuncs.com/compatible-mode/v1", "") == "qwen"
    assert classify_provider("http://127.0.0.1:11434/v1", "") == "ollama"
    assert classify_provider("https://vllm.internal/v1", "") == "generic"
    assert classify_provider(
        "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        "qwen3.8-max",
    ) == "generic"


def test_parse_models_skips_claude():
    rows = parse_models_payload(
        {
            "data": [
                {"id": "deepseek/deepseek-chat", "name": "DeepSeek"},
                {"id": "anthropic/claude-opus-5", "name": "Claude"},
                {"id": "google/gemini-3.1-pro"},
            ]
        }
    )
    ids = {r["id"] for r in rows}
    assert "deepseek/deepseek-chat" in ids
    assert "google/gemini-3.1-pro" in ids
    assert not any("claude" in i.lower() for i in ids)


def test_clamp_locks_agents_to_deepseek(monkeypatch):
    save_runtime_config(
        api_key="sk-ds-test",
        api_base="https://api.deepseek.com",
        model="gpt-4o",
    )
    monkeypatch.setattr(
        "backend.core.provider_pool._http_get_json",
        lambda url, key, timeout=15.0: (_ for _ in ()).throw(RuntimeError("offline")),
    )
    refresh_model_catalog(reason="test")
    assert clamp_model("gpt-4o") == "deepseek-chat"
    assert clamp_model("gpt-5.6-sol") == "deepseek-chat"
    assert clamp_model("deepseek-reasoner") == "deepseek-reasoner"


def test_openrouter_crawl_writes_catalog(monkeypatch):
    save_runtime_config(
        api_key="sk-or-test",
        api_base="https://openrouter.ai/api/v1",
        model="openai/gpt-4o",
    )

    def fake_get(url, key, timeout=15.0):
        assert "openrouter.ai" in url
        assert url.endswith("/models")
        return {
            "data": [
                {"id": "deepseek/deepseek-chat"},
                {"id": "qwen/qwen3.5-max"},
                {"id": "anthropic/claude-sonnet"},
            ]
        }

    monkeypatch.setattr("backend.core.provider_pool._http_get_json", fake_get)
    pool = refresh_model_catalog(reason="test")
    assert pool["provider_kind"] == "openrouter"
    assert pool["catalog_source"] == "crawl"
    assert "deepseek/deepseek-chat" in pool["allowed_models"]
    assert "qwen/qwen3.5-max" in pool["allowed_models"]
    assert not any("claude" in m.lower() for m in pool["allowed_models"])
    assert clamp_model("openai/gpt-4o") in pool["allowed_models"]


def test_models_endpoint_appends_models():
    assert models_endpoint("https://openrouter.ai/api/v1", "openrouter") == (
        "https://openrouter.ai/api/v1/models"
    )
    assert models_endpoint("https://api.deepseek.com/v1", "deepseek").endswith("/models")


def test_config_and_monitor_llm_ops_http(monkeypatch):
    from fastapi.testclient import TestClient

    from backend.main import app

    monkeypatch.setattr(task_manager, "tasks", {})
    monkeypatch.setattr(
        "backend.core.provider_pool._http_get_json",
        lambda url, key, timeout=15.0: {"data": [{"id": "deepseek-chat"}, {"id": "deepseek-reasoner"}]},
    )

    with TestClient(app) as client:
        saved = client.post(
            "/config",
            json={
                "api_key": "sk-ds-http",
                "api_base": "https://api.deepseek.com",
                "model": "gpt-4o",
            },
        )
        assert saved.status_code == 200, saved.text
        body = saved.json()
        assert body["provider_kind"] == "deepseek"
        assert "deepseek-chat" in body["allowed_models"]
        assert body["model"] in body["allowed_models"]

        ops = client.get("/monitor/llm-ops")
        assert ops.status_code == 200
        assert ops.json()["provider_kind"] == "deepseek"

        refreshed = client.post("/config/models/refresh")
        assert refreshed.status_code == 200
        prefs = client.put("/config/ops", json={"refresh_interval_sec": 120})
        assert prefs.status_code == 200
        assert prefs.json()["ops"]["refresh_interval_sec"] == 120

def test_compatible_hub_models_deepseek_only(monkeypatch):
    from backend.core.provider_pool import compatible_hub_models
    from backend.hub.catalog import HUB_CATALOG, PROVIDER_OF, runtime_hub_whitelist

    save_runtime_config(
        api_key="sk-ds-hub",
        api_base="https://api.deepseek.com",
        model="gpt-4o",
    )
    monkeypatch.setattr(
        "backend.core.provider_pool._http_get_json",
        lambda url, key, timeout=15.0: (_ for _ in ()).throw(RuntimeError("offline")),
    )
    refresh_model_catalog(reason="test")
    compat = compatible_hub_models(sorted(HUB_CATALOG), PROVIDER_OF)
    assert compat == ["deepseek-v4-flash"]
    assert "gpt-5.6-sol" not in compat
    assert runtime_hub_whitelist() == ["deepseek-v4-flash"]


def test_openrouter_maps_hub_models_by_vendor_prefix(monkeypatch):
    from backend.core.provider_pool import compatible_hub_models
    from backend.hub.catalog import HUB_CATALOG, PROVIDER_OF

    save_runtime_config(
        api_key="sk-or-hub",
        api_base="https://openrouter.ai/api/v1",
        model="",
    )

    def fake_get(url, key, timeout=15.0):
        return {
            "data": [
                {"id": "deepseek/deepseek-chat"},
                {"id": "openai/gpt-4o"},
                {"id": "anthropic/claude-sonnet"},
            ]
        }

    monkeypatch.setattr("backend.core.provider_pool._http_get_json", fake_get)
    refresh_model_catalog(reason="test")
    compat = compatible_hub_models(sorted(HUB_CATALOG), PROVIDER_OF)
    assert "deepseek-v4-flash" in compat
    assert "gpt-5.6-sol" in compat
    assert "gemini-3.1-pro" not in compat


def test_preferred_model_clamped_to_pool(monkeypatch):
    from backend.company.role_catalog import create_custom_role, resolve_runtime

    save_runtime_config(
        api_key="sk-ds-pref",
        api_base="https://api.deepseek.com",
        model="deepseek-chat",
    )
    monkeypatch.setattr(
        "backend.core.provider_pool._http_get_json",
        lambda url, key, timeout=15.0: (_ for _ in ()).throw(RuntimeError("offline")),
    )
    refresh_model_catalog(reason="test")
    created = create_custom_role(
        {
            "id": "pool_lock_test",
            "name": "pool lock test",
            "preferred_model": "gpt-4o",
            "system_prompt": "test",
        }
    )
    runtime = resolve_runtime(created["id"])
    assert runtime["preferred_model"] == "deepseek-chat"


def test_failover_models_prefers_healthy_cheaper_alternatives(monkeypatch):
    from backend.core.llm_config import merge_runtime_config
    from backend.core.provider_pool import failover_models, reset_pool_health

    reset_pool_health()
    save_runtime_config(
        api_key="sk-ds-fail",
        api_base="https://api.deepseek.com",
        model="deepseek-reasoner",
    )
    merge_runtime_config(
        {
            "allowed_models": ["deepseek-reasoner", "deepseek-chat", "deepseek-coder"],
            "provider_kind": "deepseek",
        }
    )
    chain = failover_models("deepseek-reasoner")
    assert chain[0] == "deepseek-reasoner"
    assert set(chain) == {"deepseek-reasoner", "deepseek-chat", "deepseek-coder"}


def test_invoke_with_pool_failover_switches_on_rate_limit(monkeypatch):
    from backend.core.provider_pool import invoke_with_pool_failover, reset_pool_health

    reset_pool_health()
    calls: list[str] = []

    def fake_call(*, prompt, system=None, model=None, **kwargs):
        calls.append(model)
        if model == "deepseek-reasoner":
            raise RuntimeError("429 rate limit")
        return f"ok:{model}"

    text, used, hops = invoke_with_pool_failover(
        fake_call,
        prompt="hi",
        models=["deepseek-reasoner", "deepseek-chat"],
        max_retries=1,
    )
    assert text == "ok:deepseek-chat"
    assert used == "deepseek-chat"
    assert hops == 1
    assert calls == ["deepseek-reasoner", "deepseek-chat"]


def test_pool_model_opens_after_consecutive_failures(monkeypatch):
    from backend.core.provider_pool import is_pool_model_open, record_pool_call, reset_pool_health

    reset_pool_health()
    monkeypatch.setenv("EVOL_LLM_POOL_FAIL_THRESHOLD", "2")
    # re-read threshold - it's module level constant loaded at import
    # use 2 failures which is default POOL_FAILURE_THRESHOLD
    record_pool_call("deepseek-chat", True, 0.1, "timeout")
    assert not is_pool_model_open("deepseek-chat")
    record_pool_call("deepseek-chat", True, 0.1, "timeout")
    assert is_pool_model_open("deepseek-chat")


def test_public_pool_exposes_failover_ops(monkeypatch):
    from backend.core.provider_pool import public_pool, reset_pool_health

    reset_pool_health()
    pool = public_pool()
    failover = pool["ops"]["pool_failover"]
    assert "enabled" in failover
    assert "timeout_s" in failover
    assert "models" in failover
    assert "active_probe" in failover
    assert "enabled" in failover["active_probe"]


def test_probe_pool_health_opens_primary_when_endpoint_down(monkeypatch):
    from backend.core.llm_config import merge_runtime_config
    from backend.core.provider_pool import (
        is_pool_model_open,
        probe_pool_health,
        reset_pool_health,
    )

    reset_pool_health()
    save_runtime_config(
        api_key="sk-ds-probe",
        api_base="https://api.deepseek.com",
        model="deepseek-chat",
    )
    merge_runtime_config(
        {
            "allowed_models": ["deepseek-chat", "deepseek-reasoner"],
            "provider_kind": "deepseek",
            "model": "deepseek-chat",
        }
    )
    monkeypatch.setattr(
        "backend.core.provider_pool._http_get_json",
        lambda url, key, timeout=15.0: (_ for _ in ()).throw(RuntimeError("connection refused")),
    )
    snap = probe_pool_health(reason="test")
    assert snap["ok"] is False
    assert "deepseek-chat" in snap["opened"]
    assert is_pool_model_open("deepseek-chat")
    assert snap["mode"] == "catalog"


def test_probe_pool_health_opens_missing_and_heals_probe_open(monkeypatch):
    from backend.core.llm_config import merge_runtime_config
    from backend.core.provider_pool import (
        force_open_pool_model,
        is_pool_model_open,
        probe_pool_health,
        record_pool_call,
        reset_pool_health,
    )

    reset_pool_health()
    save_runtime_config(
        api_key="sk-ds-probe2",
        api_base="https://api.deepseek.com",
        model="deepseek-chat",
    )
    merge_runtime_config(
        {
            "allowed_models": ["deepseek-chat", "deepseek-missing"],
            "provider_kind": "deepseek",
            "model": "deepseek-chat",
        }
    )
    force_open_pool_model("deepseek-chat", "old probe", from_probe=True)
    # 真實呼叫失敗造成的熔斷不應被 catalog 探活直接解除
    record_pool_call("deepseek-reasoner", True, 0.1, "timeout")
    record_pool_call("deepseek-reasoner", True, 0.1, "timeout")
    assert is_pool_model_open("deepseek-reasoner")

    monkeypatch.setattr(
        "backend.core.provider_pool._http_get_json",
        lambda url, key, timeout=15.0: {"data": [{"id": "deepseek-chat"}, {"id": "deepseek-reasoner"}]},
    )
    snap = probe_pool_health(reason="test")
    assert snap["ok"] is True
    assert "deepseek-missing" in snap["opened"]
    assert is_pool_model_open("deepseek-missing")
    assert "deepseek-chat" in snap["healed"]
    assert not is_pool_model_open("deepseek-chat")
    assert is_pool_model_open("deepseek-reasoner")


def test_probe_pool_health_optional_ping(monkeypatch):
    from backend.core.llm_config import merge_runtime_config
    from backend.core.provider_pool import (
        force_open_pool_model,
        is_pool_model_open,
        probe_pool_health,
        reset_pool_health,
    )

    reset_pool_health()
    monkeypatch.setenv("EVOL_LLM_POOL_PROBE_PING", "true")
    save_runtime_config(
        api_key="sk-ds-probe3",
        api_base="https://api.deepseek.com",
        model="deepseek-chat",
    )
    merge_runtime_config(
        {
            "allowed_models": ["deepseek-chat", "deepseek-reasoner"],
            "provider_kind": "deepseek",
            "model": "deepseek-chat",
        }
    )
    force_open_pool_model("deepseek-chat", "call fail", from_probe=False)
    monkeypatch.setattr(
        "backend.core.provider_pool._http_get_json",
        lambda url, key, timeout=15.0: {"data": [{"id": "deepseek-chat"}, {"id": "deepseek-reasoner"}]},
    )

    def fake_ping(*, prompt, system=None, model=None, **kwargs):
        if model == "deepseek-chat":
            return "pong"
        raise RuntimeError("503 unavailable")

    snap = probe_pool_health(reason="test", ping_fn=fake_ping)
    assert snap["mode"] == "catalog+ping"
    assert not is_pool_model_open("deepseek-chat")
    assert is_pool_model_open("deepseek-reasoner")
    assert "deepseek-reasoner" in snap["opened"]


def test_run_ops_once_includes_active_probe(monkeypatch):
    from backend.services.llm_ops import run_ops_once

    monkeypatch.setattr(
        "backend.services.llm_ops.refresh_model_catalog",
        lambda reason="manual": {
            "ops": {"pool_failover": {"models": {}}},
            "provider_kind": "deepseek",
        },
    )
    monkeypatch.setattr(
        "backend.services.llm_ops.probe_pool_health",
        lambda reason="schedule", ping_fn=None: {
            "enabled": True,
            "ok": True,
            "mode": "catalog",
            "opened": [],
            "healed": [],
        },
    )
    monkeypatch.setattr(
        "backend.core.provider_pool.pool_health_snapshot",
        lambda: {"deepseek-chat": {"open": False}},
    )
    pool = run_ops_once("test")
    assert pool["ops"]["pool_failover"]["active_probe"]["ok"] is True
    assert "deepseek-chat" in pool["ops"]["pool_failover"]["models"]
