"""OPC 状态字段定义。

定义 EvoLoop 中与 OPC 相关的状态字段，
供 backend/core/state.py 的 EvoLoopState 合并使用。

6 级思考闭环状态流：
  opc_readings → opc_readings_clean → opc_analysis
    → opc_diagnosis → opc_decisions → opc_actions
"""

from typing import Any

from typing_extensions import TypedDict


class OPCStateFields(TypedDict, total=False):
    """OPC 相关的状态字段。

    使用 total=False 使所有字段为可选，
    LangGraph 节点只需回传自己更新的字段。
    """

    # ── 感知 (Sense)：从服务读取的原始传感器数据 ──
    opc_readings: dict[str, Any]

    # ── 预处理 (Preprocess)：清洗后的标准化读数 ──
    opc_readings_clean: dict[str, Any]

    # ── 预处理产出：数据品质报告 ──
    opc_quality_report: dict[str, Any]

    # ── 分析 (Analyze)：统计分析与阈值违规检测 ──
    opc_analysis: dict[str, Any]

    # ── 诊断 (Diagnose)：LLM 深度诊断结果 ──
    opc_diagnosis: dict[str, Any]

    # ── 诊断产出：是否检测到异常 ──
    opc_anomaly_detected: bool

    # ── 决策 (Decide)：优先级排序的控制决策 ──
    opc_decisions: list[dict[str, Any]]

    # ── 决策产出：决策摘要 ──
    opc_decision_summary: str

    # ── 执行 (Act)：控制动作执行结果 ──
    opc_actions: list[dict[str, Any]]

    # ── 可选：历史数据（供趋势分析） ──
    opc_history: dict[str, list[float]]