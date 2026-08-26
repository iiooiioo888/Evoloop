"""敏感詞與多模態檢查。"""

from __future__ import annotations

from typing import Any

from backend.hub.catalog import MULTIMODAL_KEYS

_SENSITIVE = (
    "自杀",
    "自殺",
    "炸弹制作",
    "炸彈製作",
    "儿童色情",
    "兒童色情",
    "make a bomb",
)


def content_is_multimodal(messages: list[dict[str, Any]]) -> bool:
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and (
                    part.get("type") in MULTIMODAL_KEYS or any(k in part for k in MULTIMODAL_KEYS)
                ):
                    return True
    return False


def contains_sensitive(text: str) -> bool:
    lowered = (text or "").lower()
    return any(word.lower() in lowered for word in _SENSITIVE)


def flatten_messages_text(messages: list[dict[str, Any]]) -> str:
    chunks: list[str] = []
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, str):
            chunks.append(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    chunks.append(str(part.get("text") or ""))
    return "\n".join(chunks)
