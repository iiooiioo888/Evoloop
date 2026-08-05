# EvoLoop Backend — Dockerfile
# 基于 Python 3.10，运行 FastAPI + LangGraph 反思闭环
# 构建上下文：项目根目录（docker-compose 中指定 context: .）
FROM python:3.10-slim

WORKDIR /app

# 安装系统依赖（chromadb 需要 g++ 编译 hnswlib）
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖（先复制 requirements 以利用 Docker 层缓存）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码和共享模块
COPY backend/ ./backend/
COPY opc_service/ ./opc_service/

# 服务端口
EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# 启动 FastAPI
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]