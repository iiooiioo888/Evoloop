"""LiteLLM 統一呼叫層（Task 0.3）。

負責模型設定、速率限制重試與回應解析，所有節點都透過
此模組呼叫 LLM，方便日後替換供應商或加入快取。
"""

import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from litellm import completion
from litellm.exceptions import APIError, RateLimitError

load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_MODEL = os.getenv("EVOL_MODEL", "gpt-4o")
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2.0


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

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = completion(
                model=model or DEFAULT_MODEL, messages=messages, **kwargs
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