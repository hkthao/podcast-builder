/**
 * Chạy studio trong Docker, phần nặng vẫn ở máy thật (Mac).
 *
 * Container (STUDIO_HOST_WORKER=http://host.docker.internal:3001) chạy server + UI, còn các
 * route cần whisper.cpp / Chrome Remotion / Chrome Business Suite được chuyển nguyên request
 * sang "worker" = chính server này chạy trên Mac với STUDIO_ROLE=worker (npm run studio:worker).
 * Hai bên dùng chung input/ output/ tmp/ public/ qua bind mount.
 *
 * data.db CHỈ container mở (SQLite WAL không an toàn khi 2 bên VM/host cùng mở) — worker dùng
 * DB riêng tmp/worker.db; API key container gửi kèm mỗi request qua header (loopback, không lộ ra ngoài).
 */
import type { Context, Hono } from "hono";
import { bus } from "../shared/studio-core/events";
import { KNOWN_PROVIDERS, getApiKey } from "../shared/studio-core/api-keys-store";

export const HOST_WORKER = process.env.STUDIO_HOST_WORKER?.replace(/\/$/, "") || null;
export const IS_WORKER = process.env.STUDIO_ROLE === "worker";

const KEYS_HEADER = "x-studio-keys";

/** Route chạy trên worker (Mac). Khớp theo prefix của path. */
const HOST_ROUTES: RegExp[] = [
  /^\/api\/render(\/|$)/, // render / transcribe / plan — Remotion + whisper.cpp
  /^\/api\/comp(\/|$)/, // Ghép take — whisper.cpp
  /^\/api\/scenes(\/|$)/, // thumbnail catalog — Remotion renderStill
  /^\/api\/episodes\/[^/]+\/scene-thumbnails$/, // thumbnail cảnh — Remotion renderStill
  /^\/api\/publish\/browser$/, // Business Suite — Chrome có phiên đăng nhập
];

const envVarName = (p: string) => `${p.toUpperCase().replace(/-/g, "_")}_API_KEY`;

/** Container → worker: chuyển request y nguyên, kèm API key lấy từ data.db. */
async function forward(c: Context): Promise<Response> {
  const src = new URL(c.req.url);
  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");
  const keys: Record<string, string> = {};
  for (const p of KNOWN_PROVIDERS) {
    const k = getApiKey(p);
    if (k) keys[envVarName(p)] = k;
  }
  headers.set(KEYS_HEADER, Buffer.from(JSON.stringify(keys)).toString("base64"));
  const hasBody = !["GET", "HEAD"].includes(c.req.method);
  let res: Response;
  try {
    res = await fetch(`${HOST_WORKER}${src.pathname}${src.search}`, {
      method: c.req.method,
      headers,
      body: hasBody ? c.req.raw.body : undefined,
      // @ts-expect-error — Node fetch cần duplex khi body là stream
      duplex: hasBody ? "half" : undefined,
    });
  } catch {
    return c.json(
      { error: `Không gọi được render worker trên máy (${HOST_WORKER}) — chạy \`npm run studio:worker\` trên Mac.` },
      502,
    );
  }
  // fetch đã giải nén body → bỏ header mã hoá/độ dài cũ.
  const out = new Headers(res.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  return new Response(res.body, { status: res.status, headers: out });
}

/**
 * Worker: nhận API key từ container vào process.env (getApiKey fallback env khi DB trống;
 * tiến trình con như fb-browser.ts kế thừa env).
 */
function acceptKeys(c: Context) {
  const raw = c.req.header(KEYS_HEADER);
  if (!raw) return;
  try {
    const keys = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Record<string, string>;
    for (const [k, v] of Object.entries(keys)) if (typeof v === "string" && v) process.env[k] = v;
  } catch {
    /* header hỏng — bỏ qua, dùng env sẵn có */
  }
}

/** Container: nghe SSE của worker, phát lại render:progress vào bus để UI thấy tiến trình. */
async function relayWorkerEvents(): Promise<void> {
  for (;;) {
    try {
      const res = await fetch(`${HOST_WORKER}/api/events`);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      console.log(`[studio-server] nối SSE render worker ${HOST_WORKER}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let event = "message";
          const data: string[] = [];
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
          }
          if (event !== "render:progress" || !data.length) continue;
          try {
            bus.emit("render:progress", JSON.parse(data.join("\n")));
          } catch {
            /* bỏ qua message hỏng */
          }
        }
      }
    } catch {
      /* worker chưa chạy / vừa restart — thử lại */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** Gắn middleware — gọi TRƯỚC khi app.route(...) các route thường. */
export function installHostWorker(app: Hono): void {
  if (HOST_WORKER) {
    app.use("*", async (c, next) => {
      if (HOST_ROUTES.some((re) => re.test(c.req.path))) return forward(c);
      return next();
    });
    void relayWorkerEvents();
    console.log(`[studio-server] render/whisper/Chrome chạy trên máy: ${HOST_WORKER}`);
  }
  if (IS_WORKER) {
    app.use("*", async (c, next) => {
      acceptKeys(c);
      return next();
    });
  }
}
