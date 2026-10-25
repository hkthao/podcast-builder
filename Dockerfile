# podcast-builder studio (server Hono + UI build sẵn) chạy trong Docker.
# Render Remotion / whisper.cpp / Chrome Business Suite KHÔNG chạy ở đây — container chuyển
# các route đó sang worker trên Mac (npm run studio:worker), xem server/host-worker.ts.
#   npm run docker:build && npm run docker:up   → http://127.0.0.1:3000
FROM node:22-bookworm-slim

# ffmpeg/ffprobe: xử lý audio, nhạc nền, probe thời lượng (chạy ngay trong container).
# python3/make/g++: phòng khi better-sqlite3 / resvg thiếu prebuild cho kiến trúc này.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cài deps trước để cache layer (native module build cho Linux, không dùng node_modules của Mac).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ui/package.json ui/package-lock.json ./ui/
RUN cd ui && npm ci --no-audit --no-fund

COPY . .
# UI import vài file từ shared/ nên build sau khi đã copy toàn bộ source.
RUN cd ui && npm run build

ENV NODE_ENV=production \
    STUDIO_HOST=0.0.0.0 \
    STUDIO_PORT=3001 \
    STUDIO_UI_DIST=ui/dist \
    STUDIO_HOST_WORKER=http://host.docker.internal:3001

EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
