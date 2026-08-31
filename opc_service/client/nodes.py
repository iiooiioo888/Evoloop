"""OPC UA 節點 ID 解析 — browse / read / write 共用。"""

from __future__ import annotations


def short_tag_name(tag_name: str, node_id: str | None = None) -> str:
    """從 browse 顯示名或 node_id 還原短標籤名（如 Temperature）。"""
    if node_id and ";s=" in node_id:
        suffix = node_id.split(";s=", 1)[1]
        if ":" in suffix:
            return suffix.rsplit(":", 1)[-1]
        return suffix
    if ":" in tag_name:
        return tag_name.rsplit(":", 1)[-1]
    return tag_name


def node_id_for_tag(tag_name: str, node_id: str | None = None) -> str:
    """解析讀寫用的 OPC node id 字串。"""
    if node_id:
        return node_id
    short = short_tag_name(tag_name)
    return f"ns=2;s={short}"
