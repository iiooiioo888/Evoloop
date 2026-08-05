"""pytest 設定：確保專案根目錄在 sys.path，使 backend 套件可被匯入。

另以 autouse fixture 將 Task 8.6 的存檔目錄隔離至暫存
位置，避免測試污染真實 data/ 目錄。
"""

import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture(autouse=True)
def _isolate_archive_dir(tmp_path, monkeypatch):
    """所有測試共用：將 JSONL 存檔寫入暫存目錄。"""
    monkeypatch.setenv("EVOL_ARCHIVE_DIR", str(tmp_path / "archives"))
    yield