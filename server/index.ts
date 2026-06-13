import path from "node:path";
import fs from "node:fs/promises";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import dotenv from "dotenv";
import { brainstormRoutes } from "./routes/brainstorm";
import { episodesRoutes } from "./routes/episodes";
import { essayRoutes } from "./routes/essay";
import { llmRoutes } from "./routes/llm";
import { referencesRoutes } from "./routes/references";
import { renderRoutes } from "./routes/render";
import { workflowRoutes } from "./routes/workflow";
import { startFsWatcher } from "./lib/events";
import { sseFromBus } from "./lib/sse";
import {
  clearErrors,
  listErrors,
  logError,
  registerGlobalHandlers,
} from "./lib/error-log";

dotenv.config();
registerGlobalHandlers();

const OUTPUT_DIR = path.resolve("output");
const INPUT_DIR = path.resolve("input");
const TMP_DIR = path.resolve("tmp");

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
  const errors = listErrors();
  return c.json({
    ok: true,
    uptime: process.uptime(),
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    errorCount: errors.length,
    errors: errors.slice(0, 20),
  });
});

app.delete("/api/health/errors", (c) => {
  clearErrors();
  return c.json({ ok: true });
});

/** SSE event stream — broadcast fs changes + render progress. */
app.get("/api/events", (c) => sseFromBus(c));

app.route("/api/episodes", episodesRoutes);
app.route("/api/references", referencesRoutes);
app.route("/api/render", renderRoutes);
app.route("/api/brainstorm", brainstormRoutes);
app.route("/api/essay", essayRoutes);
app.route("/api/llm", llmRoutes);
app.route("/api/workflow", workflowRoutes);

/**
 * Serve static files cho 3 dir: input/, output/, tmp/.
 * Range header support → video <video> streaming + audio seeking trong UI.
 * Security: chỉ allow filename không có path traversal.
 */
const serveStatic = (rootDir: string) =>
  async (c: import("hono").Context) => {
    const filename = c.req.param("filename");
    if (!filename || filename.includes("..") || filename.includes("/") || filename.startsWith(".")) {
      return c.json({ error: "invalid filename" }, 400);
    }
    const filePath = path.join(rootDir, filename);
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return c.json({ error: "File not found" }, 404);
    }
    const ext = filename.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "mp4" ? "video/mp4"
      : ext === "m4a" ? "audio/mp4"
      : ext === "mp3" ? "audio/mpeg"
      : ext === "wav" ? "audio/wav"
      : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "png" ? "image/png"
      : ext === "json" ? "application/json"
      : "application/octet-stream";

    // Range request → 206 partial (cho video/audio seeking)
    const range = c.req.header("range");
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d+)?/);
      if (m) {
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : stat.size - 1;
        const chunkSize = end - start + 1;
        const fh = await fs.open(filePath, "r");
        const buf = Buffer.alloc(chunkSize);
        await fh.read(buf, 0, chunkSize, start);
        await fh.close();
        return new Response(buf as unknown as BodyInit, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunkSize),
          },
        });
      }
    }

    const buf = await fs.readFile(filePath);
    return new Response(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
      },
    });
  };

app.get("/output/:filename", serveStatic(OUTPUT_DIR));
app.get("/input/:filename", serveStatic(INPUT_DIR));
app.get("/tmp/:filename", serveStatic(TMP_DIR));

startFsWatcher();

app.notFound((c) => c.json({ error: "not found", path: c.req.path }, 404));
app.onError((e, c) => {
  logError({
    source: "api",
    error: e,
    context: { method: c.req.method, path: c.req.path },
  });
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
