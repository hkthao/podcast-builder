import { Hono } from "hono";
import {
  AUDIO_EXTENSIONS,
  deleteEpisodeFile,
  getEpisode,
  getPlan,
  getTranscript,
  listEpisodeFiles,
  listEpisodes,
  PLAN_OPTIONS,
  savePlan,
  saveEpisode,
  saveTranscript,
  uploadAudio,
} from "../lib/episode-store";
import {
  genSceneThumbnails,
  listSceneThumbnails,
} from "../lib/scene-thumbnails";

export const episodesRoutes = new Hono();

episodesRoutes.get("/", async (c) => {
  const episodes = await listEpisodes();
  return c.json({ episodes });
});

/**
 * Upload audio file → tạo episode mới hoặc replace audio cũ cùng slug.
 * Content-Type: multipart/form-data
 * Field: "audio" (single file)
 */
episodesRoutes.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body["audio"];
  if (!file || typeof file === "string" || !(file instanceof File)) {
    return c.json({ error: "Thiếu field 'audio' (file)" }, 400);
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!AUDIO_EXTENSIONS.includes(ext as (typeof AUDIO_EXTENSIONS)[number])) {
    return c.json(
      {
        error: `File ext không hỗ trợ: .${ext}`,
        accepted: AUDIO_EXTENSIONS.map((e) => `.${e}`),
      },
      400,
    );
  }
  // Optional: essayId form field để prefill title/hook từ Essay
  const essayId =
    typeof body["essayId"] === "string" && body["essayId"]
      ? (body["essayId"] as string)
      : undefined;
  const buf = new Uint8Array(await file.arrayBuffer());
  try {
    const summary = await uploadAudio(file.name, buf, { essayId });
    return c.json(summary, 201);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

episodesRoutes.get("/:name", async (c) => {
  const name = c.req.param("name");
  const ep = await getEpisode(name);
  if (!ep) {
    return c.json({ error: `Episode not found: ${name}` }, 404);
  }
  return c.json(ep);
});

/**
 * Transcript đã spell-fix (fallback raw Whisper nếu chưa spell-fix).
 * Empty array nếu chưa transcribe.
 */
episodesRoutes.get("/:name/transcript", async (c) => {
  const name = c.req.param("name");
  const data = await getTranscript(name);
  return c.json(data);
});

/**
 * Save transcript đã sửa text. Body: { segments: TranscriptSegment[] }
 * Count phải khớp với existing (chỉ edit text, không add/remove).
 */
episodesRoutes.put("/:name/transcript", async (c) => {
  const name = c.req.param("name");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as {
    segments?: Array<{ startMs: number; endMs: number; text: string }>;
  };
  if (!Array.isArray(body.segments)) {
    return c.json({ error: "Body phải có field 'segments' là array" }, 400);
  }
  try {
    const data = await saveTranscript(name, body.segments);
    return c.json(data);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "VALIDATION" ? 400 : err.code === "NOT_FOUND" ? 404 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * List tất cả file liên quan tới episode (audio input, outputs, tmp artifacts).
 * Mỗi entry có url để play/download qua /input/ /output/ /tmp/ static.
 */
episodesRoutes.get("/:name/files", async (c) => {
  const name = c.req.param("name");
  const data = await listEpisodeFiles(name);
  return c.json(data);
});

/**
 * Xoá 1 file của episode. Body: { bucket: "input"|"output"|"tmp", filename }.
 * Filename phải nằm trong whitelist của episode đó (ngăn path traversal +
 * xoá nhầm file episode khác).
 */
episodesRoutes.delete("/:name/files", async (c) => {
  const name = c.req.param("name");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as { bucket?: string; filename?: string };
  if (
    body.bucket !== "input" &&
    body.bucket !== "output" &&
    body.bucket !== "tmp"
  ) {
    return c.json({ error: "bucket phải là input/output/tmp" }, 400);
  }
  if (typeof body.filename !== "string" || body.filename.length === 0) {
    return c.json({ error: "Thiếu filename" }, 400);
  }
  try {
    const data = await deleteEpisodeFile(name, body.bucket, body.filename);
    return c.json(data);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * List scene thumbnail URLs (filesystem). Empty array nếu chưa gen.
 */
episodesRoutes.get("/:name/scene-thumbnails", async (c) => {
  const name = c.req.param("name");
  const urls = await listSceneThumbnails(name);
  return c.json({ urls });
});

/**
 * Gen scene thumbnails. Sync (10-60s). Throws nếu thiếu prereq
 * (plan/transcript/normalized.wav).
 */
episodesRoutes.post("/:name/scene-thumbnails", async (c) => {
  const name = c.req.param("name");
  try {
    const result = await genSceneThumbnails(name);
    return c.json(result);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

/** Scene plan (tmp/<name>.plan.json). Empty array nếu chưa plan. */
episodesRoutes.get("/:name/plan", async (c) => {
  const name = c.req.param("name");
  const data = await getPlan(name);
  return c.json(data);
});

/**
 * Save lại scene plan (sau khi user edit text/mood/sceneType inline).
 * Body: { scenes: ScenePlanItem[] }
 */
episodesRoutes.put("/:name/plan", async (c) => {
  const name = c.req.param("name");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as { scenes?: unknown[] };
  if (!Array.isArray(body.scenes)) {
    return c.json({ error: "Body phải có field 'scenes' là array" }, 400);
  }
  try {
    const data = await savePlan(name, body.scenes as Parameters<typeof savePlan>[1]);
    return c.json(data);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "VALIDATION" ? 400 : err.code === "NOT_FOUND" ? 404 : 500;
    return c.json({ error: err.message }, status);
  }
});

/** Bảng option valid cho mood + sceneType, dropdown UI dùng. */
episodesRoutes.get("/_/plan-options", (c) => c.json(PLAN_OPTIONS));

/**
 * Save edit config. Body: EpisodeConfig JSON (zod-validated).
 * 200 → updated EpisodeSummary
 * 400 → validation error với detail
 */
episodesRoutes.put("/:name/config", async (c) => {
  const name = c.req.param("name");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  try {
    const summary = await saveEpisode(name, raw);
    return c.json(summary);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});
