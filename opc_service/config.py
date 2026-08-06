"""OPC 服務設定（Task 7.1 / 7.2）。

所有參數皆可透過環境變數覆蓋，方便容器化部署與測試隔離。
"""

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class OPCSettings:
    """OPC UA 微服務的全域設定。"""

    # ---- OPC UA 連線 ----
    opc_server_url: str = field(
        default_factory=lambda: os.getenv(
            "OPC_SERVER_URL", "opc.tcp://localhost:4840/freeopcua/server/"
        )
    )
    opc_reconnect_interval: float = float(
        os.getenv("OPC_RECONNECT_INTERVAL", "5.0")
    )

    # ---- 服務綁定 ----
    host: str = field(
        default_factory=lambda: os.getenv("OPC_SERVICE_HOST", "0.0.0.0")
    )
    port: int = field(
        default_factory=lambda: int(os.getenv("OPC_SERVICE_PORT", "8001"))
    )

    # ---- 安全護欄（Task 7.2） ----
    # 寫入白名單：僅允許寫入這些命名空間前綴的標籤
    write_whitelist: set[str] = field(
        default_factory=lambda: set(
            filter(
                None,
                os.getenv("OPC_WRITE_WHITELIST", "ns=2;s=").split(","),
            )
        )
    )
    # 寫入邊界：{tag_suffix: (min, max)}
    write_bounds: dict[str, tuple[float, float]] = field(
        default_factory=lambda: {
            "Temperature": (0.0, 150.0),
            "Pressure": (0.0, 500.0),
            "FlowRate": (0.0, 1000.0),
            "ValvePosition": (0.0, 100.0),
            "MotorSpeed": (0.0, 3000.0),
        }
    )
    # 審計日誌目錄
    audit_log_dir: Path = field(
        default_factory=lambda: Path(
            os.getenv(
                "OPC_AUDIT_LOG_DIR",
                str(Path(__file__).resolve().parent / "audit_logs"),
            )
        )
    )
    # 是否需要人工審批（高風險操作）
    require_approval: bool = field(
        default_factory=lambda: os.getenv("OPC_REQUIRE_APPROVAL", "false").lower()
        == "true"
    )

    # ---- 模擬伺服器（Task 7.4） ----
    sim_enabled: bool = field(
        default_factory=lambda: os.getenv("OPC_SIM_ENABLED", "false").lower() == "true"
    )
    sim_port: int = field(
        default_factory=lambda: int(os.getenv("OPC_SIM_PORT", "4840"))
    )


# 全域單例
settings = OPCSettings()