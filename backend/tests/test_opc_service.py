"""Phase 7：OPC 服務單元測試。

驗證：
1. 安全護欄（白名單檢查、邊界檢查）
2. 審計日誌寫入
3. 模擬 OPC 伺服器啟動與標籤讀寫
4. API 端點（健康檢查、標籤列表）
5. 閉環情境（異常檢測 → 診斷 → 控制動作）
"""

import asyncio
import json
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# 预先 mock asyncua 模块，避免测试环境缺少该依赖时导入失败
_mock_asyncua = MagicMock()
_mock_asyncua_ua = MagicMock()
_mock_asyncua_sub = MagicMock()
sys.modules.setdefault("asyncua", _mock_asyncua)
sys.modules.setdefault("asyncua.ua", _mock_asyncua_ua)
sys.modules.setdefault(
    "asyncua.common.subscription", _mock_asyncua_sub
)


# ---- 安全護欄測試 ----

def test_whitelist_allows_configured_prefix(monkeypatch):
    """白名單檢查：設定前綴後，匹配的標籤通過。"""
    monkeypatch.setenv("OPC_WRITE_WHITELIST", "Temperature,Pressure")
    from opc_service.config import OPCSettings

    settings = OPCSettings()
    from opc_service.guard import WriteGuard

    guard = WriteGuard()
    # 覆蓋設定
    monkeypatch.setattr(
        "opc_service.guard.settings", settings
    )

    ok, _ = guard.check_whitelist("Temperature")
    assert ok is True

    ok, _ = guard.check_whitelist("FlowRate")
    assert ok is False


def test_bounds_rejects_out_of_range():
    """邊界檢查：超出安全範圍的值被拒絕。"""
    from opc_service.guard import WriteGuard

    guard = WriteGuard()

    ok, msg = guard.check_bounds("Temperature", 25.0)
    assert ok is True

    ok, msg = guard.check_bounds("Temperature", 200.0)
    assert ok is False
    assert "超出" in msg


def test_validate_write_combines_checks(monkeypatch):
    """綜合檢查：同時驗證白名單與邊界。"""
    monkeypatch.setenv("OPC_WRITE_WHITELIST", "Temperature,Pressure,ValvePosition")
    from opc_service.config import OPCSettings

    settings = OPCSettings()
    monkeypatch.setattr(
        "opc_service.guard.settings", settings
    )
    from opc_service.guard import WriteGuard

    guard = WriteGuard()

    # 標籤不在白名單 → 拒絕
    ok, msg = guard.validate_write("FlowRate", 50.0)
    assert ok is False

    # 在白名單但超出邊界 → 拒絕
    ok, msg = guard.validate_write("Temperature", 200.0)
    assert ok is False

    # 通過所有檢查 → 允許
    ok, msg = guard.validate_write("Temperature", 80.0)
    assert ok is True


# ---- 審計日誌測試 ----

def test_audit_log_writes_jsonl(tmp_path, monkeypatch):
    """審計日誌：寫入 JSONL 檔案，每行一個 JSON 物件。"""
    monkeypatch.setenv("OPC_AUDIT_LOG_DIR", str(tmp_path))
    from opc_service.config import OPCSettings

    settings = OPCSettings()
    monkeypatch.setattr(
        "opc_service.audit.settings", settings
    )

    from opc_service.audit import AuditLogger

    logger = AuditLogger()
    logger.log_write("Temperature", 80.0, reason="測試寫入", result="success")

    # 確認檔案存在
    files = list(tmp_path.glob("opc_audit_*.jsonl"))
    assert len(files) == 1

    line = files[0].read_text(encoding="utf-8").strip()
    record = json.loads(line)
    assert record["tag_name"] == "Temperature"
    assert record["value"] == 80.0
    assert record["operation"] == "write"
    assert record["result"] == "success"


# ---- API 端點測試 ----

@pytest.fixture
def test_app():
    """建立測試用 FastAPI app（不連線真實 OPC）。"""
    from opc_service.app import app

    return app


def test_health_endpoint(test_app):
    """健康檢查端點回傳正確結構。"""
    client = TestClient(test_app)
    resp = client.get("/opc/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "opc_connected" in data


def test_read_endpoint_returns_error_when_disconnected(test_app):
    """未連線 OPC 時，讀取端點回傳錯誤（不崩潰）。"""
    client = TestClient(test_app)
    resp = client.post(
        "/opc/read",
        json={"tag_names": ["Temperature"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    # 降級模式：回傳 tags 列表但含 error
    assert "tags" in data
    assert data.get("error") is not None or len(data["tags"]) == 0


def test_write_endpoint_with_guard(test_app, monkeypatch):
    """寫入端點：安全護欄拒絕不合規的寫入。"""
    monkeypatch.setenv("OPC_WRITE_WHITELIST", "Temperature")
    from opc_service.config import OPCSettings

    settings = OPCSettings()
    monkeypatch.setattr(
        "opc_service.guard.settings", settings
    )

    client = TestClient(test_app)
    resp = client.post(
        "/opc/write",
        json={
            "entries": [
                {"tag_name": "FlowRate", "value": 50.0}
            ],
            "reason": "測試",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["results"]) == 1
    assert data["results"][0]["success"] is False


# ---- 閉環情境測試（Task 7.4） ----

def test_opc_graph_sense_diagnose_act():
    """驗證 OPC 診斷圖的完整流程（使用 mock LLM）。"""
    from opc_service.graph import build_opc_graph

    responses = [
        json.dumps(
            {
                "anomaly_detected": True,
                "analysis": "溫度異常升高",
                "root_cause": "冷卻水流量不足",
                "actions": [
                    {
                        "tag_name": "ValvePosition",
                        "value": 80.0,
                        "reason": "增加冷卻水流量",
                    }
                ],
            },
            ensure_ascii=False,
        )
    ]

    async def fake_read_tags(tag_names):
        return {
            "Temperature": {
                "value": 120.0,
                "quality": "Good",
            },
            "Pressure": {"value": 150.0, "quality": "Good"},
            "FlowRate": {"value": 5.0, "quality": "Good"},
            "ValvePosition": {"value": 20.0, "quality": "Good"},
        }

    async def fake_write_tags(entries, reason=""):
        return [
            {
                "tag_name": e["tag_name"],
                "success": True,
                "message": "寫入成功",
                "written_value": e["value"],
            }
            for e in entries
        ]

    fake = MagicMock()
    fake.side_effect = responses

    with (
        patch(
            "opc_service.sense._read_opc_tags",
            side_effect=fake_read_tags,
        ),
        patch(
            "opc_service.act._write_opc_tags",
            side_effect=fake_write_tags,
        ),
        patch(
            "opc_service.diagnose.call_llm",
            side_effect=fake,
        ),
    ):
        result = asyncio.run(
            build_opc_graph().ainvoke(
                {"query": "檢查製程狀態", "session_id": "test-session"}
            )
        )

    assert result["opc_anomaly_detected"] is True
    assert len(result["opc_actions"]) == 1
    assert result["opc_actions"][0]["success"] is True


def test_opc_graph_no_anomaly():
    """正常製程：無異常檢測，無控制動作。"""
    from opc_service.graph import build_opc_graph

    responses = [
        json.dumps(
            {
                "anomaly_detected": False,
                "analysis": "所有參數正常",
                "root_cause": "",
                "actions": [],
            },
            ensure_ascii=False,
        )
    ]

    async def fake_read_tags(tag_names):
        return {
            "Temperature": {"value": 25.0, "quality": "Good"},
            "Pressure": {"value": 101.3, "quality": "Good"},
        }

    fake = MagicMock()
    fake.side_effect = responses

    with (
        patch(
            "opc_service.sense._read_opc_tags",
            side_effect=fake_read_tags,
        ),
        patch(
            "opc_service.diagnose.call_llm",
            side_effect=fake,
        ),
    ):
        result = asyncio.run(
            build_opc_graph().ainvoke(
                {"query": "檢查製程狀態", "session_id": "test-session"}
            )
        )

    assert result["opc_anomaly_detected"] is False
    assert result["opc_actions"] == []