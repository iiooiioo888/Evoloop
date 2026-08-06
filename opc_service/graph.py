"""OPC 诊断与控制图编排。

组装 sense → diagnose → act → END 的 LangGraph 流程。
"""

from langgraph.graph import END, StateGraph

from opc_service.act import act_opc
from opc_service.diagnose import diagnose_opc
from opc_service.sense import sense_opc
from opc_service.state import OPCStateFields


def build_opc_graph():
    """组装 OPC 诊断与控制专用图。

    流程：sense_opc → diagnose_opc → act_opc → END

    此图可独立使用，也可作为 EvoLoop 主图的子图。
    """
    graph = StateGraph(OPCStateFields)

    graph.add_node("sense_opc", sense_opc)
    graph.add_node("diagnose_opc", diagnose_opc)
    graph.add_node("act_opc", act_opc)

    graph.add_edge("sense_opc", "diagnose_opc")
    graph.add_edge("diagnose_opc", "act_opc")
    graph.add_edge("act_opc", END)

    graph.set_entry_point("sense_opc")

    return graph.compile()


# 供 API 层直接使用的编译图实例
opc_graph = build_opc_graph()