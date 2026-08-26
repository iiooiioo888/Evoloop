"""LLM 模型池運維：定時爬取目錄、健康檢查、監控快照。"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from backend.core.provider_pool import public_pool, refresh_interval_sec, refresh_model_catalog

logger = logging.getLogger(__name__)


def ops_enabled() -> bool:
    return os.getenv("EVOL_LLM_OPS_ENABLED", "true").lower() not in {"0", "false", "no"}


def collect_llm_ops() -> dict[str, Any]:
    return public_pool()


def run_ops_once(reason: str = "schedule") -> dict[str, Any]:
    return refresh_model_catalog(reason=reason)


async def llm_ops_loop() -> None:
    """背景迴圈：依設定間隔刷新模型目錄。測試時 EVOL_LLM_OPS_ENABLED=false 立即結束。"""
    if not ops_enabled():
        logger.info("LLM 運維迴圈已停用（EVOL_LLM_OPS_ENABLED）")
        return
    while ops_enabled():
        try:
            run_ops_once("schedule")
        except Exception:  # noqa: BLE001
            logger.warning("LLM 定時目錄檢查失敗", exc_info=True)
        await asyncio.sleep(refresh_interval_sec())
