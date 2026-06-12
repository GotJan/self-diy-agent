import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 配置 — 仅构建 Electron 渲染进程
// 主进程 (electron/main.js / preload.js) 不走 Vite，由 Node.js 直接执行
// 借鉴 huntian-agent 的简洁架构

export default defineConfig({
  plugins: [react()],
  base: './',                    // Electron file:// 协议必需相对路径
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
