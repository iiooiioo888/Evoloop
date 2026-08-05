"""OPC 状态字段定义。

定义 EvoLoop 中与 OPC 相关的状态字段，
供 backend/core/state.py 的 EvoLoopState 合并使用。
"""

from typing import Any

from typing_extensions import TypedDict


class OPCStateFields(TypedDict, total=False):
    """OPC 相关的状态字段。

    使用 total=False 使所有字段为可选，
    LangGraph 节点只需回传自己更新的字段。
    """

    # OPC 感知：从服务读取的传感器数据
    opc_readings: dict[str, Any]

    # OPC 执行：控制动作列表
    opc_actions: list[dict[str, Any]]

    # OPC 诊断：是否检测到异常
    opc_anomaly_detected: bool