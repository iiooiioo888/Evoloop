"""模拟 OPC UA 服务器 — 标签定义。

定义模拟工业环境中所有可用的传感器/执行器标签。
"""

# 模拟标签定义：(名称, 初始值, 变化范围, 变化速度)
SIM_TAGS: list[dict] = [
    {
        "name": "Temperature",
        "init": 25.0,
        "range": (0.0, 150.0),
        "drift": 0.3,
        "unit": "°C",
        "desc": "反应槽温度",
    },
    {
        "name": "Pressure",
        "init": 101.3,
        "range": (0.0, 500.0),
        "drift": 0.5,
        "unit": "kPa",
        "desc": "管线压力",
    },
    {
        "name": "FlowRate",
        "init": 50.0,
        "range": (0.0, 1000.0),
        "drift": 2.0,
        "unit": "L/min",
        "desc": "冷却水流量",
    },
    {
        "name": "ValvePosition",
        "init": 30.0,
        "range": (0.0, 100.0),
        "drift": 0.0,
        "unit": "%",
        "desc": "控制阀开度",
    },
    {
        "name": "MotorSpeed",
        "init": 1500.0,
        "range": (0.0, 3000.0),
        "drift": 5.0,
        "unit": "RPM",
        "desc": "主马达转速",
    },
    {
        "name": "Level",
        "init": 60.0,
        "range": (0.0, 100.0),
        "drift": 0.1,
        "unit": "%",
        "desc": "储槽液位",
    },
    {
        "name": "AlarmStatus",
        "init": 0.0,
        "range": (0.0, 1.0),
        "drift": 0.0,
        "unit": "",
        "desc": "警报状态（0=正常, 1=警报）",
    },
    {
        "name": "PowerConsumption",
        "init": 45.0,
        "range": (0.0, 200.0),
        "drift": 0.8,
        "unit": "kW",
        "desc": "设备总功耗",
    },
]