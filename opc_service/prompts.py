"""OPC 工业诊断与决策 Prompt 模板。

供 diagnose_opc 与 decide_opc 节点使用，
指导 LLM 分析传感器数据并制定控制策略。
"""

# ==================== 诊断 (Diagnose) ====================

DIAGNOSE_OPC_SYSTEM = (
    "你是一位工业自动化与制程控制专家，"
    "擅长分析 OPC UA 传感器数据，判断异常并给出根因分析与控制建议。"
)

DIAGNOSE_OPC = """请根据以下预处理后的传感器读数与统计分析结果，进行工业制程深度诊断。

【预处理后的传感器读数】
{readings}

【统计分析结果】
{analysis}

【用户问题】
{query}

请分析：
1. 是否存在异常状况需要立即处理
2. 异常的严重程度（critical / warning / normal）
3. 异常的根本原因可能是什么
4. 建议采取哪些控制动作（写入哪些标签，目标值为何）

只输出 JSON，不要输出任何其他文字：
{{"anomaly_detected": <true/false>, "severity": "<critical/warning/normal>", "analysis": "<诊断分析>", "root_cause": "<根本原因>", "suggested_actions": [{{"tag_name": "<标签名>", "value": <目标值>, "reason": "<原因>"}}]}}"""


# ==================== 决策 (Decide) ====================

DECIDE_OPC_SYSTEM = (
    "你是一位工业控制系统决策专家，"
    "擅长根据诊断结果制定安全、有效的控制策略，"
    "并对每个动作进行风险评估与优先级排序。"
)

DECIDE_OPC = """请根据以下诊断结果与分析数据，制定优先级排序的控制策略。

{context}

【用户目标】
{query}

请制定控制策略，考虑：
1. 动作优先级：critical（立即执行）> high（尽快执行）> medium（按计划执行）> low（可延后）
2. 风险评估：每个动作的潜在风险（low / medium / high）
3. 执行顺序：多个动作间的依赖关系与先后顺序
4. 安全约束：确保每个动作在安全范围内

只输出 JSON，不要输出任何其他文字：
{{"summary": "<决策摘要>", "decisions": [{{"tag_name": "<标签名>", "value": <目标值>, "reason": "<原因>", "priority": "<critical/high/medium/low>", "risk": "<low/medium/high>", "risk_note": "<风险说明>", "order": <执行顺序 1-N>}}]}}"""


# 默认读取的标签列表
DEFAULT_SENSE_TAGS = [
    "Temperature",
    "Pressure",
    "FlowRate",
    "ValvePosition",
    "MotorSpeed",
    "Level",
    "AlarmStatus",
    "PowerConsumption",
]