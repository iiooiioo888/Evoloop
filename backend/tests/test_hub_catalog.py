"""AI Hub 九模型目錄契約（docs/AI_HUB_DETAILED_DESIGN.md §1.6）。

凍結條件：
- 目錄恰好 9 個 ID，與價目表 / 設計文件 OpenAPI enum 對齊
- 不含任何 Claude / Anthropic 模型 ID
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from backend.company.budget import CostTracker, _MODEL_COST_PER_1M_TOKENS

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DESIGN_DOC = PROJECT_ROOT / "docs" / "AI_HUB_DETAILED_DESIGN.md"

HUB_CATALOG: frozenset[str] = frozenset(
    {
        "gpt-5.6-sol",
        "gemini-3.1-pro",
        "mimo-v2.5-pro",
        "deepseek-v4-flash",
        "qwen3.5-max",
        "mercury-2",
        "nemotron-3.5-lightning",
        "glm-5.2",
        "kimi-k3",
    }
)

FORBIDDEN_SUBSTR = ("claude", "anthropic", "opus-", "sonnet-", "haiku-", "fable")

# LangGraph 公司運行時既有模型，允許與 Hub 目錄並存
LEGACY_RUNTIME_MODELS: frozenset[str] = frozenset(
    {
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-3.5-turbo",
        "deepseek-chat",
        "deepseek-reasoner",
    }
)


class TestHubCatalogExcludesClaude:
    def test_hub_catalog_excludes_claude(self) -> None:
        joined = " ".join(HUB_CATALOG).lower()
        for needle in FORBIDDEN_SUBSTR:
            assert needle not in joined, f"Hub 目錄不得包含 {needle!r}"

        for key in _MODEL_COST_PER_1M_TOKENS:
            lowered = key.lower()
            for needle in FORBIDDEN_SUBSTR:
                assert needle not in lowered, f"價目表鍵 {key!r} 含禁止子串 {needle!r}"

    def test_budget_table_contains_all_hub_models(self) -> None:
        keys = set(_MODEL_COST_PER_1M_TOKENS)
        missing = HUB_CATALOG - keys
        assert not missing, f"budget.py 缺少 Hub 模型：{sorted(missing)}"
        extra = keys - HUB_CATALOG - LEGACY_RUNTIME_MODELS
        assert not extra, f"價目表出現目錄外模型（禁止靜默新增）：{sorted(extra)}"

    def test_hub_sol_and_gemini_unit_prices(self) -> None:
        assert CostTracker.estimate_cost("gpt-5.6-sol", 1_000_000, 1_000_000) == 33.0
        assert CostTracker.estimate_cost("gemini-3.1-pro", 1_000_000, 1_000_000) == 13.25
        assert CostTracker.estimate_cost(
            "deepseek-v4-flash", 1_000_000, 1_000_000
        ) == pytest.approx(0.185)
        assert CostTracker.estimate_cost("nemotron-3.5-lightning", 1_000_000, 1_000_000) == 0.0

    def test_design_openapi_enum_matches_catalog(self) -> None:
        text = DESIGN_DOC.read_text(encoding="utf-8")
        block = _extract_fenced_block(text, "yaml")
        match = re.search(
            r"ModelId:\n      type: string\n      enum:\n((?:        - [^\n]+\n)+)",
            block,
        )
        assert match, "OpenAPI 缺少 ModelId enum"
        enum_ids = set(re.findall(r"- ([a-z0-9][a-z0-9.\-]+)", match.group(1)))
        assert enum_ids == HUB_CATALOG, (
            f"OpenAPI enum 與 Hub 目錄不一致：缺少 {sorted(HUB_CATALOG - enum_ids)} "
            f"多餘 {sorted(enum_ids - HUB_CATALOG)}"
        )

    def test_design_default_failover_chain_has_no_claude(self) -> None:
        text = DESIGN_DOC.read_text(encoding="utf-8")
        match = re.search(
            r'DEFAULT_CHAIN = \(([^)]+)\)',
            text,
        )
        assert match, "設計文件缺少 DEFAULT_CHAIN"
        chain = re.findall(r'"([^"]+)"', match.group(1))
        assert chain == [
            "gpt-5.6-sol",
            "gemini-3.1-pro",
            "deepseek-v4-flash",
            "glm-5.2",
        ]
        for model in chain:
            lowered = model.lower()
            for needle in FORBIDDEN_SUBSTR:
                assert needle not in lowered

    def test_runtime_catalog_matches_frozen_set(self) -> None:
        from backend.hub.catalog import DEFAULT_CHAIN, HUB_CATALOG as RUNTIME, INTEL

        assert RUNTIME == HUB_CATALOG
        assert set(INTEL) == HUB_CATALOG
        assert DEFAULT_CHAIN == (
            "gpt-5.6-sol",
            "gemini-3.1-pro",
            "deepseek-v4-flash",
            "glm-5.2",
        )
        from backend.hub.catalog import HUB_CATALOG as LIVE

        joined = " ".join(LIVE).lower()
        for needle in FORBIDDEN_SUBSTR:
            assert needle not in joined


def _extract_fenced_block(markdown: str, language: str) -> str:
    pattern = rf"```{language}\n(.*?)```"
    blocks = re.findall(pattern, markdown, re.DOTALL)
    assert blocks, f"設計文件缺少 ```{language} 區塊"
    # 取最長的 yaml（完整 OpenAPI）
    return max(blocks, key=len)
