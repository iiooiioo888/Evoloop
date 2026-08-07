"""OPC 6 级思考闭环图编排。

组装 6 级工业闭环流程：
  sense → preprocess → analyze → diagnose → decide → act → END

每级职责：
  S1  sense_opc      感知：读取原始传感器数据
  P1  preprocess_opc  预处理：数据清洗、品质过滤、标准化
  A1  analyze_opc     分析：统计计算、阈值违规检测、趋势识别
  Dg1 diagnose_opc    诊断：LLM 深度分析、异常检测与根因分析
  D1  decide_opc      决策：控制策略制定、优先级排序、风险评估
  A2  act_opc         执行：写入控制动作（经安全护栏）、结果验证
"""

from langgraph.graph import END, StateGraph

from opc_service.act import act_opc
from opc_service.analyze import analyze_opc
from opc_service.decide import decide_opc
from opc_service.diagnose import diagnose_opc
from opc_service.preprocess import preprocess_opc
from opc_service.sense import sense_opc
from opc_service.state import OPCStateFields


def build_opc_graph():
    """组装 OPC 6 级思考闭环图。

    流程：sense_opc → preprocess_opc → analyze_opc
           → diagnose_opc → decide_opc → act_opc → END

    此图可独立使用，也可作为 EvoLoop 主图的子图。
    """
    graph = StateGraph(OPCStateFields)

    graph.add_node("sense_opc", sense_opc)
    graph.add_node("preprocess_opc", preprocess_opc)
    graph.add_node("analyze_opc", analyze_opc)
    graph.add_node("diagnose_opc", diagnose_opc)
    graph.add_node("decide_opc", decide_opc)
    graph.add_node("act_opc", act_opc)

    graph.add_edge("sense_opc", "preprocess_opc")
    graph.add_edge("preprocess_opc", "analyze_opc")
    graph.add_edge("analyze_opc", "diagnose_opc")
    graph.add_edge("diagnose_opc", "decide_opc")
    graph.add_edge("decide_opc", "act_opc")
    graph.add_edge("act_opc", END)

    graph.set_entry_point("sense_opc")

    return graph.compile()


# 供 API 层直接使用的编译图实例
opc_graph = build_opc_graph()