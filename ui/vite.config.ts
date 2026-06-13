import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      // Tránh CORS — Vite proxy /api → Hono :3001.
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: false,
      },
      // Static file proxies — serve audio/video/image qua Hono.
      // Cần cho <audio>/<video> tag trong FilesPanel + Range request seeking.
      "/input": { target: "http://127.0.0.1:3001", changeOrigin: false },
      "/output": { target: "http://127.0.0.1:3001", changeOrigin: false },
      "/tmp": { target: "http://127.0.0.1:3001", changeOrigin: false },
      // SSE qua proxy. Hono đã set Connection: keep-alive.
      "/api/events": {
        target: "http://127.0.0.1:3001",
        changeOrigin: false,
        ws: false,
        // Tắt buffer cho SSE
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["x-accel-buffering"] = "no";
          });
        },
      },
    },
  },
});
