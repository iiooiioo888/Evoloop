import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 專案站必須用 /Evoloop/，本機與 Docker 維持 /
const base = process.env.VITE_BASE || '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // 開發時將 API 請求代理到 FastAPI 後端
      // 容器內執行時透過 VITE_PROXY_TARGET 指向服務名（如 http://backend:8000）
      // Hub 最長前綴必須先匹配，否則會被 /api 剝除前綴變成 /v1/...
      '/api/v1': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
