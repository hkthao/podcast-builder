import path from "node:path";
import fs from "node:fs/promises";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import dotenv from "dotenv";
import { episodesRoutes } from "./routes/episodes";
import { renderRoutes } from "./routes/render";
import { startFsWatcher } from "./lib/events";
import { sseFromBus } from "./lib/sse";

dotenv.config();

const OUTPUT_DIR = path.resolve("output");

const PORT = Number(process.env.STUDIO_PORT ?? 3001);
/** Origin của Vite dev server. Local-only — không expose. */
const UI_ORIGIN = process.env.STUDIO_UI_ORIGIN ?? "http://localhost:3000";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: UI_ORIGIN,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: false,
  }),
);

app.get("/api/health", (c) => {
  return c.json({ ok: true, uptime: process.uptime() });
});

/** SSE event stream — broadcast fs changes + render progress. */
app.get("/api/events", (c) => sseFromBus(c));

app.route("/api/episodes", episodesRoutes);
app.route("/api/render", renderRoutes);

/**
 * Serve output/ static files (mp4, jpg, json).
 * Path: /output/<filename> — UI hardcode link href tới đây.
 */
app.get("/output/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (filename.includes("..") || filename.includes("/")) {
    return c.json({ error: "invalid filename" }, 400);
  }
  const filePath = path.join(OUTPUT_DIR, filename);
  try {
    const buf = await fs.readFile(filePath);
    const ext = filename.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "mp4" ? "video/mp4"
      : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "json" ? "application/json"
      : "application/octet-stream";
    return new Response(buf as unknown as BodyInit, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

startFsWatcher();

app.notFound((c) => c.json({ error: "not found", path: c.req.path }, 404));
app.onError((e, c) => {
  console.error("[studio-server] error:", e);
  return c.json({ error: e.message }, 500);
});

serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: "127.0.0.1", // local-only, không bind 0.0.0.0
  },
  (info) => {
    console.log(
      `[studio-server] http://127.0.0.1:${info.port}  (CORS from ${UI_ORIGIN})`,
    );
  },
);
