# EvoLoop OPC Service — Dockerfile
# 基于 Python 3.10，运行 OPC UA 工业数据微服务
# 构建上下文：项目根目录（docker-compose 中指定 context: .）
FROM python:3.10-slim

WORKDIR /app

# 安装 Python 依赖（先复制 requirements 以利用 Docker 层缓存）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制 OPC 服务代码
COPY opc_service/ ./opc_service/

# 服务端口
EXPOSE 8001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/opc/health')" || exit 1

# 启动 FastAPI
CMD ["uvicorn", "opc_service.main:app", "--host", "0.0.0.0", "--port", "8001"]