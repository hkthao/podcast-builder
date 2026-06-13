import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import dotenv from "dotenv";
import { episodesRoutes } from "./routes/episodes";
import { startFsWatcher } from "./lib/events";
import { sseFromBus } from "./lib/sse";

dotenv.config();

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
