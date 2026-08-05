# EvoLoop Frontend — Dockerfile
# 多阶段构建：Node 构建静态资源 → Nginx 提供服务并代理 /api 到后端
# 构建上下文：项目根目录（docker-compose 中指定 context: .）

# ---- 阶段 1：构建 ----
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖清单以利用 Docker 层缓存
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# 复制源码并构建
COPY frontend/ ./
RUN npm run build

# ---- 阶段 2：运行 ----
FROM nginx:alpine

# Nginx 配置：SPA 路由 + /api 反向代理到 backend 服务
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q -O /dev/null http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
