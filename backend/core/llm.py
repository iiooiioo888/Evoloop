"""LiteLLM 統一呼叫層（Task 0.3）。

負責模型設定、速率限制重試與回應解析，所有節點都透過
此模組呼叫 LLM，方便日後替換供應商或加入快取。

LLM 供應商參數（金鑰、端點、模型）優先讀取運行時
配置（llm_config，可透過 /config API 動態設定），
未設定時回退環境變數。
"""

import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from litellm import completion
from litellm.exceptions import APIError, RateLimitError

from backend.core.llm_config import get_runtime_config

load_dotenv()

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2.0


def _llm_params() -> dict:
    """讀取当前生效的 LLM 參數（每次呼叫時讀取，支援動態變更）。

    自訂 api_base 場景（如 Qwen 相容模式）：模型名必須帶
    `openai/` 供應商前綴，LiteLLM 才知道走 OpenAI 協定
    （未帶前綴的未知模型名會報 "LLM Provider NOT provided"），
    且 api_base 會覆蓋官方端點。
    """
    cfg = get_runtime_config()
    params: dict = {"model": cfg.get("model") or "gpt-4o"}
    if cfg.get("api_key"):
        params["api_key"] = cfg["api_key"]
    if cfg.get("api_base"):
        params["api_base"] = cfg["api_base"]
        params["model"] = _ensure_provider_prefix(params["model"])
    return params


def _ensure_provider_prefix(model: str) -> str:
    """確保模型名帶供應商前綴；自訂端點場景補上 openai/。"""
    return model if "/" in model else f"openai/{model}"


def call_llm(
    prompt: str,
    system: str | None = None,
    model: str | None = None,
    **kwargs,
) -> str:
    """呼叫 LLM 並回傳回應文字。

    內建指數退避重試，處理速率限制（RateLimitError）
    與暫時性 API 錯誤。
    """
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    params = _llm_params()
    if model:
        params["model"] = model
        # 顯式傳入的模型同樣需要補前綴（如公司模式層級路由）
        if params.get("api_base"):
            params["model"] = _ensure_provider_prefix(params["model"])

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = completion(
                model=params["model"],
                messages=messages,
                **{k: v for k, v in params.items() if k != "model"},
                **kwargs,
            )
            return response.choices[0].message.content or ""
        except RateLimitError as exc:
            last_error = exc
            wait = RETRY_BACKOFF_SECONDS * attempt
            logger.warning(
                "LLM 速率限制，%.1f 秒後重試（%d/%d）", wait, attempt, MAX_RETRIES
            )
            time.sleep(wait)
        except APIError as exc:
            last_error = exc
            logger.warning("LLM 呼叫失敗：%s，重試（%d/%d）", exc, attempt, MAX_RETRIES)
            time.sleep(RETRY_BACKOFF_SECONDS)
    raise RuntimeError(f"LLM 呼叫於 {MAX_RETRIES} 次重試後仍失敗") from last_error


def call_llm_stream(
    prompt: str,
    system: str | None = None,
    model: str | None = None,
    **kwargs,
):
    """呼叫 LLM 並串流回傳回應片段（生成器）。

    與 call_llm 相同的重試邏輯，但逐塊 yield 文字。
    """
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    params = _llm_params()
    if model:
        params["model"] = model
        if params.get("api_base"):
            params["model"] = _ensure_provider_prefix(params["model"])

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = completion(
                model=params["model"],
                messages=messages,
                stream=True,
                **{k: v for k, v in params.items() if k != "model"},
                **kwargs,
            )
            for chunk in response:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield delta.content
            return
        except RateLimitError as exc:
            last_error = exc
            wait = RETRY_BACKOFF_SECONDS * attempt
            logger.warning(
                "LLM 速率限制，%.1f 秒後重試（%d/%d）", wait, attempt, MAX_RETRIES
            )
            time.sleep(wait)
        except APIError as exc:
            last_error = exc
            logger.warning("LLM 呼叫失敗：%s，重試（%d/%d）", exc, attempt, MAX_RETRIES)
            time.sleep(RETRY_BACKOFF_SECONDS)
    raise RuntimeError(f"LLM 呼叫於 {MAX_RETRIES} 次重試後仍失敗") from last_error


def parse_json_response(text: str) -> dict:
    """穩健地解析 LLM 回傳的 JSON。

    依序嘗試：直接解析 → 去除 markdown 程式碼圍欄 →
    擷取最外層 {...} 區塊。
    """
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise