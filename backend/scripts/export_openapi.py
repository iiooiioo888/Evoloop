"""匯出 FastAPI OpenAPI 契約至 docs/openapi.json，供前端獨立對接。"""

from __future__ import annotations

import json
from pathlib import Path


def main() -> None:
    from backend.main import app

    spec = app.openapi()
    root = Path(__file__).resolve().parents[2]
    out = root / "docs" / "openapi.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out} ({len(spec.get('paths', {}))} paths)")


if __name__ == "__main__":
    main()
