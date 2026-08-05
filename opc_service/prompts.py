"""OPC 工业诊断 Prompt 模板。

供 diagnose_opc 节点使用，指导 LLM 分析传感器数据。
"""

DIAGNOSE_OPC_SYSTEM = (
    "你是一位工业自动化与制程控制专家，"
    "擅长分析 OPC UA 传感器数据，判断异常并给出控制建议。"
)

DIAGNOSE_OPC = """请根据以下 OPC 传感器读数，进行工业制程诊断。

【当前传感器读数】
{readings}

【用户问题】
{query}

请分析：
1. 是否有异常状况需要立即处理
2. 异常的根本原因可能是什么
3. 建议采取哪些控制动作（写入哪些标签，目标值为何）

只输出 JSON，不要输出任何其他文字：
{{"anomaly_detected": <true/false>, "analysis": "<诊断分析>", "root_cause": "<根本原因>", "actions": [{{"tag_name": "<标签名>", "value": <目标值>, "reason": "<原因>"}}]}}"""

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