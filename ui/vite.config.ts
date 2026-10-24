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
    // IPv4 loopback (không phải 0.0.0.0): container Tailscale gọi vào qua host.docker.internal → 127.0.0.1;
    // mặc định "localhost" chỉ nghe [::1] nên Docker không tới được. Vẫn KHÔNG mở ra mạng LAN.
    host: "127.0.0.1",
    // Truy cập từ điện thoại qua Tailscale (deploy/tailscale: container proxy → host.docker.internal:3000).
    allowedHosts: [".ts.net", "host.docker.internal"],
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
      // SSE log chạy reel align/assemble.
      "/api/reel/run": {
        target: "http://127.0.0.1:3001",
        changeOrigin: false,
        ws: false,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["x-accel-buffering"] = "no";
          });
        },
      },
    },
  },
});
