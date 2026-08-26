"""Hub 工具執行層契約：五倉微服務 + OPC 護欄。"""

from __future__ import annotations

import pytest

from backend.hub.errors import HubError
from backend.hub.tools import (
    infer_tools,
    invoke_tool,
    littlecrawler_fetch,
    mint_tool_jwt,
    pysdnopc_read,
    storyforge_draft,
    tool_arguments,
)


def test_infer_tools_moutai_uses_stocksx() -> None:
    assert infer_tools("分析茅台當前估值") == ["StocksX_get_price"]


def test_infer_tools_crawler_and_opc() -> None:
    tools = infer_tools("去爬 https://news.example.com/industry 並讀製程溫度")
    assert "LittleCrawler_fetch" in tools
    assert "PysdnOPC_read" in tools


def test_infer_tools_storyforge() -> None:
    assert infer_tools("寫一個科幻故事大綱") == ["StoryForge_draft"]


def test_stocksx_quote_contract() -> None:
    result = invoke_tool("StocksX_get_price", "分析茅台當前估值", "user-1")
    assert result["http_status"] == 200
    assert result["data"]["current_price"] == 1888
    assert result["data"]["pe_ratio"] == 28.5
    assert result["arguments"]["symbol"] == "600519.SH"


def test_crawler_whitelist_only() -> None:
    result = invoke_tool("LittleCrawler_fetch", "抓取 https://finance.example.com/600519", "user-1")
    assert result["data"]["title"] == "貴州茅台估值快訊"
    with pytest.raises(HubError) as exc:
        token = mint_tool_jwt("user-1", "littlecrawler", "crawler:read")
        littlecrawler_fetch("https://evil.example", token)
    assert exc.value.status == 400


def test_storyforge_returns_outline() -> None:
    result = invoke_tool("StoryForge_draft", "寫一個科幻故事", "user-1")
    assert result["data"]["genre"] == "scifi"
    assert len(result["data"]["outline"]) == 3
    token = mint_tool_jwt("user-1", "storyforge", "story:draft")
    draft = storyforge_draft("前提", token, "literary")
    assert draft["constraints"]["must_not_fabricate_facts"] is True


def test_opc_read_via_service_shape_never_writes() -> None:
    result = invoke_tool("PysdnOPC_read", "讀取製程 Temperature", "user-1")
    assert result["data"]["via"] == "opc_service"
    assert result["data"]["guard_bypassed"] is False
    assert result["data"]["tags"][0]["tag_name"] == "Temperature"
    token = mint_tool_jwt("user-1", "pysdnopc", "opc:read")
    payload = pysdnopc_read(["Pressure"], token)
    assert payload["endpoint"] == "POST /opc/read"
    with pytest.raises(HubError) as exc:
        invoke_tool("PysdnOPC_write", "把閥開到 80", "user-1")
    assert exc.value.code == "OPC_GUARD_REQUIRED"


def test_tool_arguments_not_hardcoded_symbol_for_crawler() -> None:
    args = tool_arguments("LittleCrawler_fetch", "請爬 https://news.example.com/industry")
    assert args["url"] == "https://news.example.com/industry"
    assert "symbol" not in args
