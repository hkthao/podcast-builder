/**
 * Routes ghép & vá audio ("comp/patch take"). Mount tại /api/comp.
 *
 * Endpoints (đều theo :name = slug episode):
 *   GET  /:name/takes                 → liệt kê take + trạng thái transcript
 *   POST /:name/takes/transcribe      → job transcribe các take (async)
 *   GET  /:name/jobs/:jobId           → poll trạng thái job
 *   GET  /:name/align?base=<variant>  → câu nền + ứng viên đã căn (sync)
 *   POST /:name/build                 → job dựng bản ghép từ {base, patches}
 *   POST /:name/promote               → comp → primary (sync)
 */
import crypto from "node:crypto";
import { Hono } from "hono";
import {
  listTakes,
  loadSentences,
  transcribeTake,
  alignToBase,
  editSentence,
  compFromPatches,
  promoteComp,
  saveUpload,
  deleteUpload,
  PRIMARY_VARIANT,
  type Patch,
} from "../lib/comp";

export const compRoutes = new Hono();

// ─────────────────────── mini job runner (async) ───────────────────────

type CompJob = {
  id: string;
  slug: string;
  kind: "transcribe" | "build";
  status: "running" | "done" | "error";
  percent: number;
  message: string;
  result: unknown;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
};

const jobs = new Map<string, CompJob>();

const newJob = (slug: string, kind: CompJob["kind"]): CompJob => {
  const id = `comp_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const job: CompJob = {
    id,
    slug,
    kind,
    status: "running",
    percent: 0,
    message: "",
    result: null,
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(id, job);
  // GC sau 1h
  setTimeout(() => jobs.delete(id), 60 * 60 * 1000);
  return job;
};

const runJob = (job: CompJob, fn: (j: CompJob) => Promise<unknown>): void => {
  fn(job)
    .then((result) => {
      job.result = result;
      job.status = "done";
      job.percent = 100;
      job.finishedAt = Date.now();
    })
    .catch((e: unknown) => {
      job.status = "error";
      job.error = (e as Error).message;
      job.finishedAt = Date.now();
    });
};

// ─────────────────────────────── routes ───────────────────────────────

compRoutes.get("/:name/takes", async (c) => {
  const slug = c.req.param("name");
  const takes = await listTakes(slug);
  return c.json({ takes });
});

compRoutes.post("/:name/takes/transcribe", async (c) => {
  const slug = c.req.param("name");
  let body: { variants?: string[] } = {};
  try {
    body = await c.req.json();
  } catch {
    /* body optional */
  }
  const takes = await listTakes(slug);
  const targets =
    body.variants && body.variants.length > 0
      ? takes.filter((t) => body.variants!.includes(t.variant))
      : takes.filter((t) => !t.hasTranscript);
  if (targets.length === 0) {
    return c.json({ error: "Không có take nào cần transcribe" }, 400);
  }
  const job = newJob(slug, "transcribe");
  runJob(job, async (j) => {
    const done: Record<string, number> = {};
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      j.message = `Transcribe ${t.variant} (${i + 1}/${targets.length})…`;
      j.percent = Math.round((i / targets.length) * 100);
      done[t.variant] = await transcribeTake(slug, t.variant);
    }
    j.message = "Xong";
    return { transcribed: done };
  });
  return c.json({ jobId: job.id }, 201);
});

compRoutes.get("/:name/jobs/:jobId", (c) => {
  const job = jobs.get(c.req.param("jobId"));
  if (!job) return c.json({ error: "Job không tồn tại" }, 404);
  return c.json(job);
});

compRoutes.get("/:name/align", async (c) => {
  const slug = c.req.param("name");
  const base = c.req.query("base") ?? PRIMARY_VARIANT;
  const baseSents = loadSentences(slug, base);
  if (baseSents.length === 0) {
    return c.json(
      { error: `Bản nền "${base}" chưa có transcript. Transcribe trước.` },
      400,
    );
  }
  const takes = await listTakes(slug);
  const candidates = takes
    .filter((t) => t.variant !== base && t.hasTranscript)
    .map((t) => ({ variant: t.variant, sents: loadSentences(slug, t.variant) }))
    .filter((cd) => cd.sents.length > 0);
  const rows = alignToBase(baseSents, candidates);
  return c.json({
    base,
    candidateVariants: candidates.map((cd) => cd.variant),
    rows,
  });
});

/** Sửa chính tả 1 câu trong bản nền. Body: { base, startMs, endMs, text }. */
compRoutes.post("/:name/edit-sentence", async (c) => {
  const slug = c.req.param("name");
  let body: { base?: string; startMs?: number; endMs?: number; text?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không hợp lệ" }, 400);
  }
  const base = String(body.base ?? "").trim();
  const startMs = Number(body.startMs);
  const endMs = Number(body.endMs);
  const text = String(body.text ?? "");
  if (!base) return c.json({ error: "Thiếu base" }, 400);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return c.json({ error: "startMs/endMs không hợp lệ" }, 400);
  }
  try {
    const rows = editSentence(slug, base, startMs, endMs, text);
    return c.json({ ok: true, rows });
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

compRoutes.post("/:name/build", async (c) => {
  const slug = c.req.param("name");
  let body: { base?: string; patches?: Patch[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không hợp lệ" }, 400);
  }
  const base = body.base ?? PRIMARY_VARIANT;
  const patches = body.patches ?? [];
  if (patches.length === 0) {
    return c.json({ error: "Chưa có patch nào" }, 400);
  }
  const job = newJob(slug, "build");
  runJob(job, async (j) => {
    j.message = "Chuẩn hoá loudness + dò khoảng lặng…";
    j.percent = 30;
    const res = await compFromPatches(slug, base, patches);
    j.message = "Ghép xong";
    return {
      file: res.file,
      url: `/input/${slug}.comp.m4a`,
      durationMs: res.durationMs,
      edl: res.edl,
    };
  });
  return c.json({ jobId: job.id }, 201);
});

const UPLOAD_EXTS = ["m4a", "mp3", "wav", "aac", "ogg", "webm", "flac"];

compRoutes.post("/:name/upload-take", async (c) => {
  const slug = c.req.param("name");
  const body = await c.req.parseBody();
  const file = body["audio"];
  if (!file || typeof file === "string" || !(file instanceof File)) {
    return c.json({ error: "Thiếu file audio" }, 400);
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!UPLOAD_EXTS.includes(ext)) {
    return c.json({ error: `Định dạng không hỗ trợ: .${ext}` }, 400);
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const take = await saveUpload(slug, buf, file.name);
  return c.json(take, 201);
});

compRoutes.delete("/:name/take/:variant", (c) => {
  const slug = c.req.param("name");
  try {
    deleteUpload(slug, c.req.param("variant"));
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

compRoutes.post("/:name/promote", (c) => {
  const slug = c.req.param("name");
  try {
    const primary = promoteComp(slug);
    return c.json({ ok: true, primary });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
