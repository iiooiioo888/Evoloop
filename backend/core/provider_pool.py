"""依已儲存的 API 鎖定可用模型池。

規則：
- 單一廠商端點（如 DeepSeek）：Agent 只能用該廠商模型，禁止落到 gpt-4o 預設。
- 通用 OpenAI 相容端點（OpenRouter / Ollama / vLLM）：GET /models 爬取目錄並寫入配置。
- 禁止 Claude / Anthropic 進入可用池。
"""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.request
from collections.abc import Iterable, Mapping
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

FORBIDDEN_RE = re.compile(r"(?i)claude|anthropic|opus-|sonnet-|haiku-|fable")

VENDOR_STATIC: dict[str, tuple[str, ...]] = {
    "deepseek": (
        "deepseek-chat",
        "deepseek-reasoner",
        "deepseek-coder",
        "deepseek-v3",
        "deepseek-v4-flash",
    ),
    "qwen": (
        "qwen-plus",
        "qwen-turbo",
        "qwen-max",
        "qwen-long",
        "qwen3.5-max",
        "qwen3-coder-plus",
    ),
    "moonshot": (
        "kimi-k2",
        "kimi-k3",
        "moonshot-v1-8k",
        "moonshot-v1-32k",
        "moonshot-v1-128k",
    ),
    "zhipu": ("glm-4", "glm-4-flash", "glm-4-plus", "glm-5.2"),
    "mimo": ("mimo-v2.5-pro",),
    "openai": ("gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-5.6-sol"),
}

VENDOR_HOSTS: tuple[tuple[str, str], ...] = (
    ("openrouter.ai", "openrouter"),
    ("api.deepseek.com", "deepseek"),
    ("dashscope.aliyuncs.com", "qwen"),
    ("dashscope-intl.aliyuncs.com", "qwen"),
    ("api.moonshot.cn", "moonshot"),
    ("api.moonshot.ai", "moonshot"),
    ("open.bigmodel.cn", "zhipu"),
    ("api.openai.com", "openai"),
)

KIND_LABELS: dict[str, str] = {
    "deepseek": "DeepSeek（單一廠商）",
    "qwen": "通義千問 Qwen（單一廠商）",
    "moonshot": "Moonshot / Kimi（單一廠商）",
    "zhipu": "智譜 GLM（單一廠商）",
    "mimo": "小米 MiMo（單一廠商）",
    "openai": "OpenAI",
    "openrouter": "OpenRouter（通用模型目錄）",
    "ollama": "Ollama（本地通用）",
    "generic": "OpenAI 相容通用端點",
}

CRAWL_KINDS = frozenset({"openrouter", "ollama", "generic", "openai"})
DEFAULT_REFRESH_SEC = 300


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _bare(model: str) -> str:
    text = (model or "").strip()
    if not text:
        return ""
    return text.split("/")[-1].lower()


def is_forbidden_model(model: str) -> bool:
    return bool(FORBIDDEN_RE.search(model or ""))


def classify_provider(api_base: str = "", model: str = "") -> str:
    """依端點與模型名判斷供應商類型。"""
    base = (api_base or "").strip().lower()
    model_l = (model or "").strip().lower()
    host = (urlparse(base).hostname or "").lower() if base else ""

    if "11434" in base or host in {"localhost", "127.0.0.1"} and "11434" in base:
        return "ollama"
    for needle, kind in VENDOR_HOSTS:
        if needle in host or needle in base:
            return kind
    if "openrouter" in base:
        return "openrouter"
    # 自訂 / 閘道端點優先當通用：依 GET /models 鎖定，不被目前模型名帶跑
    if base:
        return "generic"
    if model_l.startswith("deepseek") or "/deepseek" in model_l:
        return "deepseek"
    if "qwen" in model_l:
        return "qwen"
    if model_l.startswith("kimi") or model_l.startswith("moonshot"):
        return "moonshot"
    if model_l.startswith("glm"):
        return "zhipu"
    if model_l.startswith("mimo"):
        return "mimo"
    return "openai"


def models_endpoint(api_base: str, kind: str) -> str:
    """OpenAI 相容 GET /models URL。"""
    base = (api_base or "").strip().rstrip("/")
    if not base:
        if kind == "openai":
            return "https://api.openai.com/v1/models"
        if kind == "deepseek":
            return "https://api.deepseek.com/v1/models"
        if kind == "openrouter":
            return "https://openrouter.ai/api/v1/models"
        if kind == "ollama":
            return "http://127.0.0.1:11434/v1/models"
        return ""
    if base.endswith("/models"):
        return base
    if base.endswith("/v1"):
        return f"{base}/models"
    if "/v1/" in base:
        return f"{base.rstrip('/')}/models"
    return f"{base}/v1/models"


def _http_get_json(url: str, api_key: str, timeout: float = 15.0) -> dict[str, Any]:
    headers = {
        "Accept": "application/json",
        "User-Agent": "EvoLoop/1.0",
        "HTTP-Referer": "https://evoloop.local",
        "X-Title": "EvoLoop",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    data = json.loads(raw)
    if not isinstance(data, dict):
        if isinstance(data, list):
            return {"data": data}
        raise ValueError("模型目錄回應不是 JSON 物件")
    return data


def parse_models_payload(payload: dict[str, Any]) -> list[dict[str, str]]:
    rows = payload.get("data") or payload.get("models") or payload.get("data".upper())
    if rows is None and isinstance(payload.get("id"), str):
        rows = [payload]
    if not isinstance(rows, list):
        return []
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in rows:
        if isinstance(item, str):
            mid = item.strip()
            owned = ""
            name = mid
        elif isinstance(item, dict):
            mid = str(item.get("id") or item.get("name") or "").strip()
            owned = str(item.get("owned_by") or item.get("canonical_slug") or "")
            name = str(item.get("name") or mid)
        else:
            continue
        if not mid or is_forbidden_model(mid) or is_forbidden_model(name):
            continue
        key = mid.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({"id": mid, "name": name, "owned_by": owned})
    return out


def static_catalog(kind: str) -> list[dict[str, str]]:
    models = VENDOR_STATIC.get(kind, ())
    return [{"id": m, "name": m, "owned_by": kind} for m in models]


def _model_in_pool(requested: str, allowed: list[str]) -> str | None:
    req = (requested or "").strip()
    if not req or is_forbidden_model(req):
        return None
    allowed_l = [a.strip() for a in allowed if a and not is_forbidden_model(a)]
    if req in allowed_l:
        return req
    bare = _bare(req)
    for item in allowed_l:
        if item == req or _bare(item) == bare:
            return item
    return None


def clamp_model(requested: str | None, *, cfg: dict[str, Any] | None = None) -> str:
    """把請求模型鎖在目前 API 能用的池內。"""
    from backend.core.llm_config import get_runtime_config

    runtime = cfg or get_runtime_config()
    allowed = [str(x) for x in (runtime.get("allowed_models") or []) if str(x).strip()]
    fallback = (runtime.get("model") or "").strip() or (allowed[0] if allowed else "gpt-4o")
    if is_forbidden_model(fallback) and allowed:
        fallback = allowed[0]
    if not requested:
        return fallback if not is_forbidden_model(fallback) else (allowed[0] if allowed else "deepseek-chat")
    hit = _model_in_pool(requested, allowed or ([fallback] if fallback else []))
    if hit:
        return hit
    if allowed:
        logger.info("模型 %s 不在目前 API 可用池，改用 %s", requested, fallback)
        return fallback if _model_in_pool(fallback, allowed) else allowed[0]
    kind = classify_provider(str(runtime.get("api_base") or ""), fallback)
    static_ids = [row["id"] for row in static_catalog(kind)]
    hit = _model_in_pool(requested, static_ids)
    if hit:
        return hit
    if static_ids:
        logger.info("模型 %s 不屬於 %s，改用 %s", requested, kind, static_ids[0])
        return static_ids[0]
    return fallback


def compatible_hub_models(
    hub_ids: Iterable[str],
    provider_of: Mapping[str, str] | None = None,
) -> list[str]:
    """Hub 目錄與目前 API 可用池的交集。

    只存 DeepSeek 時只會留下 DeepSeek 列；OpenRouter 則依爬取目錄的廠商前綴對應。
    對不到任何一筆時回空清單，呼叫端應回退完整目錄並交給 clamp_model。
    """
    from backend.core.llm_config import get_runtime_config

    runtime = get_runtime_config()
    allowed = [str(x) for x in (runtime.get("allowed_models") or []) if str(x).strip()]
    kind = str(
        runtime.get("provider_kind")
        or classify_provider(str(runtime.get("api_base") or ""), str(runtime.get("model") or ""))
    )
    ids = [str(x) for x in hub_ids]
    if not allowed:
        return ids

    matched: list[str] = []
    for hid in ids:
        if _model_in_pool(hid, allowed):
            matched.append(hid)
            continue
        hb = _bare(hid)
        if any(hb and (_bare(a) == hb or hb in _bare(a) or _bare(a) in hb) for a in allowed):
            matched.append(hid)
            continue
        vendor = str((provider_of or {}).get(hid) or "")
        if vendor == kind and kind not in CRAWL_KINDS:
            matched.append(hid)
            continue
        if vendor:
            prefix = f"{vendor}/"
            if any(a.lower().startswith(prefix) or f"/{vendor}" in a.lower() for a in allowed):
                matched.append(hid)
    return matched


def refresh_interval_sec(cfg: dict[str, Any] | None = None) -> int:
    from backend.core.llm_config import get_runtime_config

    runtime = cfg or get_runtime_config()
    try:
        raw = int(runtime.get("ops_refresh_interval_sec") or os.getenv("EVOL_LLM_OPS_INTERVAL_SEC", DEFAULT_REFRESH_SEC))
    except (TypeError, ValueError):
        raw = DEFAULT_REFRESH_SEC
    return max(60, min(3600, raw))


def refresh_model_catalog(*, reason: str = "manual") -> dict[str, Any]:
    """爬取或回退靜態目錄，寫入 llm_config，並必要時修正預設模型。"""
    from backend.core.llm_config import get_runtime_config, merge_runtime_config

    cfg = get_runtime_config()
    api_base = str(cfg.get("api_base") or "")
    api_key = str(cfg.get("api_key") or "")
    current_model = str(cfg.get("model") or "")
    kind = classify_provider(api_base, current_model)
    url = models_endpoint(api_base, kind)
    started = datetime.now(timezone.utc)
    error = ""
    source = "static"
    models: list[dict[str, str]] = []

    should_crawl = bool(url) and (kind in CRAWL_KINDS or bool(api_key and url))
    if should_crawl:
        try:
            payload = _http_get_json(url, api_key)
            models = parse_models_payload(payload)
            if models:
                source = "crawl"
            else:
                error = "目錄為空，改用靜態清單"
        except Exception as exc:  # noqa: BLE001 — 爬取失敗必須回退，不得中斷 Agent
            error = str(exc)[:300]
            logger.warning("爬取模型目錄失敗（%s %s）：%s", kind, url, error)

    if not models:
        models = static_catalog(kind)
        if models and source != "crawl":
            source = "static"
        if not models and current_model and not is_forbidden_model(current_model):
            models = [{"id": current_model, "name": current_model, "owned_by": kind}]
            source = "configured"

    allowed = [m["id"] for m in models]
    chosen = current_model
    if not _model_in_pool(chosen, allowed) and allowed:
        chosen = allowed[0]
        logger.info("預設模型 %s 不可用，改為 %s（provider=%s）", current_model, chosen, kind)

    elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
    ok = source == "crawl" or (source in {"static", "configured"} and bool(allowed))
    snapshot = merge_runtime_config(
        {
            "model": chosen,
            "provider_kind": kind,
            "allowed_models": allowed,
            "catalog_models": models[:200],
            "catalog_source": source,
            "catalog_fetched_at": _now_iso(),
            "catalog_error": error,
            "catalog_url": url,
            "ops_last_reason": reason,
            "ops_last_ok_at": _now_iso() if ok else cfg.get("ops_last_ok_at") or "",
            "ops_last_error": error,
            "ops_last_latency_ms": elapsed_ms,
            "ops_consecutive_fail": 0 if ok else int(cfg.get("ops_consecutive_fail") or 0) + 1,
        }
    )
    return public_pool(snapshot)


def public_pool(cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    from backend.core.llm_config import get_runtime_config

    runtime = cfg or get_runtime_config()
    kind = str(runtime.get("provider_kind") or classify_provider(
        str(runtime.get("api_base") or ""), str(runtime.get("model") or "")
    ))
    fetched = str(runtime.get("catalog_fetched_at") or "")
    interval = refresh_interval_sec(runtime)
    stale = False
    if fetched:
        try:
            ts = datetime.fromisoformat(fetched.replace("Z", "+00:00"))
            age = (datetime.now(timezone.utc) - ts.astimezone(timezone.utc)).total_seconds()
            stale = age > interval * 2
        except ValueError:
            stale = True
    else:
        stale = True
    allowed = [str(x) for x in (runtime.get("allowed_models") or []) if str(x).strip()]
    models = runtime.get("catalog_models") or [{"id": m, "name": m, "owned_by": kind} for m in allowed]
    return {
        "provider_kind": kind,
        "provider_label": KIND_LABELS.get(kind, kind),
        "single_vendor": (kind not in CRAWL_KINDS)
        or (kind == "openai" and not str(runtime.get("api_base") or "")),
        "lock_message": _lock_message(kind, allowed),
        "model": runtime.get("model") or "",
        "api_base": runtime.get("api_base") or "",
        "configured": bool(runtime.get("api_key")),
        "allowed_models": allowed,
        "catalog": models,
        "catalog_source": runtime.get("catalog_source") or "",
        "catalog_url": runtime.get("catalog_url") or "",
        "catalog_fetched_at": fetched,
        "catalog_error": runtime.get("catalog_error") or "",
        "ops": {
            "refresh_interval_sec": interval,
            "last_ok_at": runtime.get("ops_last_ok_at") or "",
            "last_error": runtime.get("ops_last_error") or "",
            "last_latency_ms": int(runtime.get("ops_last_latency_ms") or 0),
            "last_reason": runtime.get("ops_last_reason") or "",
            "consecutive_fail": int(runtime.get("ops_consecutive_fail") or 0),
            "stale": stale,
            "enabled": os.getenv("EVOL_LLM_OPS_ENABLED", "true").lower() not in {"0", "false", "no"},
            "next_check_at": _next_check_at(fetched, interval),
        },
    }


def _next_check_at(fetched: str, interval: int) -> str:
    if not fetched:
        return ""
    try:
        ts = datetime.fromisoformat(fetched.replace("Z", "+00:00"))
        nxt = ts.astimezone(timezone.utc) + timedelta(seconds=interval)
        return nxt.isoformat()
    except ValueError:
        return ""


def _lock_message(kind: str, allowed: list[str]) -> str:
    n = len(allowed)
    if kind == "openrouter":
        return f"OpenRouter 通用目錄：已載入 {n} 個可用模型（已排除 Claude）"
    if kind in CRAWL_KINDS:
        return f"通用端點已鎖定 {n} 個爬取模型；Agent 不得改用其他廠商"
    label = KIND_LABELS.get(kind, kind)
    return f"目前只配置了 {label}，Agent 只能使用該廠商模型（{n}）"


def set_refresh_interval(seconds: int) -> dict[str, Any]:
    from backend.core.llm_config import merge_runtime_config

    snapshot = merge_runtime_config({"ops_refresh_interval_sec": max(60, min(3600, int(seconds)))})
    return public_pool(snapshot)
