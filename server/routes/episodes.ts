import { Hono } from "hono";
import {
  AUDIO_EXTENSIONS,
  getEpisode,
  listEpisodes,
  saveEpisode,
  uploadAudio,
} from "../lib/episode-store";

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
  const buf = new Uint8Array(await file.arrayBuffer());
  try {
    const summary = await uploadAudio(file.name, buf);
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
