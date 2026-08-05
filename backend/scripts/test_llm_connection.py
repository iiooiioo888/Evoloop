"""Task 0.3：外部 LLM 連線測試腳本。

驗證 API 金鑰與模型設定是否正確，並確認速率限制重試
機制可正常運作。執行方式：

    python backend/scripts/test_llm_connection.py
"""

import sys
from pathlib import Path

# 讓腳本可從專案根目錄之外直接執行
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.core.llm import call_llm
from backend.core.llm_config import get_runtime_config


def main() -> None:
    model = get_runtime_config().get("model", "gpt-4o")
    print(f"正在測試 LLM 連線（模型：{model}）...")
    try:
        reply = call_llm("請用一句話回覆：連線成功。", temperature=0)
    except RuntimeError as exc:
        print(f"[FAIL] LLM 呼叫失敗（已含重試）：{exc}")
        print("請透過前端設定介面或 .env 配置 API 金鑰與模型。")
        sys.exit(1)
    print(f"[OK] LLM 回應：{reply.strip()}")
    print("[OK] API 金鑰與模型設定正常。")


if __name__ == "__main__":
    main()