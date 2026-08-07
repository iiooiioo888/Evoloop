"""公司模式 Docker 工具節點。

提供公司編排器可調用的 Docker 容器管理工具，與 OPC 工具並列為
公司運行時的基礎設施控制能力。工具分為兩類：

- 只讀工具：查詢容器狀態、日誌、資源統計、健康檢查
  → Reviewer、Developer 可使用
- 控制工具：重啟/停止/啟動服務
  → Manager、DevOps 可使用

所有工具透過 DockerManager 統一調用，確保安全檢查與審計。
容器服務採用按時計費（類似阿里雲 ECS），執行時長 × 小時單價。
"""

from __future__ import annotations

import logging
from typing import Any

from backend.services.docker_manager import DockerManager, get_docker_manager

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════
# 工具定義
# ═══════════════════════════════════════════════════════════════

DOCKER_TOOLS: dict[str, str] = {
    "docker_ps": "查詢所有 EvoLoop 容器狀態（名稱、運行狀態、健康狀態、端口）",
    "docker_logs": "讀取指定服務的最近日誌（參數：service, tail）",
    "docker_stats": "查看所有容器的資源使用統計（CPU、記憶體、網路）",
    "docker_health": "檢查所有服務的健康狀態",
    "docker_restart": "重啟指定服務（參數：service）— 需 Manager/DevOps 權限",
    "docker_stop": "停止指定服務（參數：service）— 需 Manager/DevOps 權限",
    "docker_start": "啟動指定服務（參數：service）— 需 Manager/DevOps 權限",
}

# 只讀工具：Reviewer、Developer 可使用
READONLY_DOCKER_TOOLS = {"docker_ps", "docker_logs", "docker_stats", "docker_health"}

# 控制工具：僅 Manager、DevOps 可使用
CONTROL_DOCKER_TOOLS = {"docker_restart", "docker_stop", "docker_start"}

# ═══════════════════════════════════════════════════════════════
# 容器服務按時計費（USD / 小時）— 類似阿里雲 ECS 按量付費
# ═══════════════════════════════════════════════════════════════

DOCKER_SERVICE_HOURLY_RATES: dict[str, float] = {
    "backend": 0.02,      # 核心運算服務
    "frontend": 0.01,     # Web 前端
    "opc": 0.015,         # OPC UA 工業服務
    "redis": 0.005,       # 緩存 / 消息隊列
    "chroma": 0.005,      # 向量記憶庫
}

# 未知服務的預設小時費率
DEFAULT_HOURLY_RATE = 0.01


def get_service_hourly_rate(service: str) -> float:
    """獲取指定服務的按時費率（USD/小時）。

    Args:
        service: 服務名稱

    Returns:
        小時費率，未知服務回傳 DEFAULT_HOURLY_RATE
    """
    return DOCKER_SERVICE_HOURLY_RATES.get(service, DEFAULT_HOURLY_RATE)


# ═══════════════════════════════════════════════════════════════
# 工具執行函數
# ═══════════════════════════════════════════════════════════════

def execute_docker_tool(
    tool_name: str,
    args: dict[str, Any] | None = None,
    *,
    manager: DockerManager | None = None,
) -> str:
    """執行 Docker 工具並返回格式化結果。

    Args:
        tool_name: 工具名稱（docker_ps, docker_logs 等）
        args: 工具參數（如 {service: "backend", tail: 50}）
        manager: DockerManager 實例（若為 None 則使用預設單例）

    Returns:
        格式化後的結果字串，可直接嵌入 LLM 上下文
    """
    if manager is None:
        manager = get_docker_manager()

    args = args or {}

    if tool_name == "docker_ps":
        return _format_container_list(manager.list_containers())

    if tool_name == "docker_logs":
        service = args.get("service", "backend")
        tail = int(args.get("tail", 100))
        logs = manager.get_container_logs(service, tail=tail)
        return f"=== {service} 日誌（最近 {tail} 行）===\n{logs}"

    if tool_name == "docker_stats":
        return _format_stats(manager.get_stats())

    if tool_name == "docker_health":
        return _format_health(manager.health_check())

    if tool_name == "docker_restart":
        service = args.get("service", "")
        if not service:
            return "錯誤：缺少 service 參數"
        result = manager.restart_service(service)
        return f"重啟 {service}：{'成功' if result['success'] else '失敗'} — {result['message']}"

    if tool_name == "docker_stop":
        service = args.get("service", "")
        if not service:
            return "錯誤：缺少 service 參數"
        result = manager.stop_service(service)
        return f"停止 {service}：{'成功' if result['success'] else '失敗'} — {result['message']}"

    if tool_name == "docker_start":
        service = args.get("service", "")
        if not service:
            return "錯誤：缺少 service 參數"
        result = manager.start_service(service)
        return f"啟動 {service}：{'成功' if result['success'] else '失敗'} — {result['message']}"

    return f"未知的 Docker 工具：{tool_name}"


# ═══════════════════════════════════════════════════════════════
# 格式化輔助函數
# ═══════════════════════════════════════════════════════════════

def _format_container_list(containers: list[dict[str, Any]]) -> str:
    """格式化容器列表為可讀文字。"""
    if not containers:
        return "沒有找到 EvoLoop 容器"

    lines = ["=== EvoLoop 容器狀態 ==="]
    for c in containers:
        name = c.get("service", c["name"])
        status = c["status"]
        health = c.get("health", "unknown")
        ports = ", ".join(c.get("ports", [])) or "無"
        lines.append(
            f"  {name:<20} 狀態: {status:<30} 健康: {health:<10} 端口: {ports}"
        )
    return "\n".join(lines)


def _format_stats(stats: dict[str, Any]) -> str:
    """格式化資源統計。"""
    if not stats:
        return "無法獲取資源統計"

    lines = ["=== 容器資源使用 ==="]
    for service, s in sorted(stats.items()):
        if "error" in s:
            lines.append(f"  {service:<20} 錯誤: {s['error']}")
            continue
        cpu = s.get("cpu_percent", 0)
        mem_mb = s.get("memory_usage", 0) / (1024 * 1024)
        mem_limit_mb = s.get("memory_limit", 0) / (1024 * 1024)
        rx_mb = s.get("network_rx", 0) / (1024 * 1024)
        tx_mb = s.get("network_tx", 0) / (1024 * 1024)
        lines.append(
            f"  {service:<20} CPU: {cpu:6.1f}%  "
            f"記憶體: {mem_mb:.0f}/{mem_limit_mb:.0f} MB  "
            f"網路 RX: {rx_mb:.1f} MB  TX: {tx_mb:.1f} MB"
        )
    return "\n".join(lines)


def _format_health(health: dict[str, Any]) -> str:
    """格式化健康檢查結果。"""
    if "_error" in health:
        return f"健康檢查失敗：{health['_error']}"

    lines = [
        f"=== 健康檢查（全部健康: {'是' if health['all_healthy'] else '否'}）==="
    ]
    for service, h in sorted(health.get("services", {}).items()):
        icon = "✓" if h["healthy"] else "✗"
        lines.append(f"  {icon} {service:<20} {h['status']} ({h['health_detail']})")
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════
# 公司角色權限檢查
# ═══════════════════════════════════════════════════════════════

def can_use_docker_tool(role: str, tool_name: str) -> bool:
    """檢查指定角色是否有權使用某個 Docker 工具。

    Args:
        role: 角色值（manager, devops, reviewer, developer 等）
        tool_name: 工具名稱

    Returns:
        True 表示有權使用
    """
    # Manager 和 DevOps 可以使用全部工具
    if role in ("manager", "devops"):
        return True

    # 其他角色只能使用只讀工具
    return tool_name in READONLY_DOCKER_TOOLS