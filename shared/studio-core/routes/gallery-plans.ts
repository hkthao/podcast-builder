/**
 * Gallery chapter plan routes — Phase 3d.
 * Path: /api/gallery/plans
 */
import { Hono } from "hono";
import {
  clearPlanBgm,
  createPlanFromIdea,
  deletePlan,
  findPlanBySource,
  galleryPlanBgmFilename,
  generateChapterTranscript,
  getPlan,
  listPlans,
  setPlanBgm,
  updateChapter,
  updatePlanChapters,
  type GalleryPlanChapter,
} from "../gallery-plan-store";
import { generateChapterAudio } from "../gallery-chapter-audio";
import { renderChapter } from "../gallery-render";
import { exportPlan } from "../gallery-concat";
import { PATHS } from "../paths";
import path from "node:path";
import fs from "node:fs/promises";
import {
  getSession,
  isGallerySession,
} from "../../../podcast/server/lib/brainstorm-store";
import type { LLMProvider } from "../llm-providers";

export const galleryPlanRoutes = new Hono();

galleryPlanRoutes.get("/", async (c) => {
  const brainstormId = c.req.query("brainstormId") || undefined;
  const plans = await listPlans(brainstormId ? { brainstormId } : {});
  return c.json({ plans });
});

galleryPlanRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const plan = await getPlan(id);
  if (!plan) return c.json({ error: "Plan not found" }, 404);
  return c.json(plan);
});

/**
 * Lookup plan theo source (brainstormId + ideaIdx). UI dùng để check
 * "đã có plan chưa" trước khi tạo mới.
 */
galleryPlanRoutes.get("/_/lookup", async (c) => {
  const brainstormId = c.req.query("brainstormId");
  const ideaIdxStr = c.req.query("ideaIdx");
  if (!brainstormId || ideaIdxStr === undefined) {
    return c.json({ error: "Cần brainstormId + ideaIdx" }, 400);
  }
  const ideaIdx = Number(ideaIdxStr);
  if (!Number.isInteger(ideaIdx) || ideaIdx < 0) {
    return c.json({ error: "ideaIdx phải là integer ≥ 0" }, 400);
  }
  const plan = await findPlanBySource(brainstormId, ideaIdx);
  return c.json({ plan });
});

/**
 * Tạo plan mới từ gallery brainstorm idea đã pick.
 * Body: { brainstormId, ideaIdx }
 * Idempotent: nếu plan đã tồn tại → return plan cũ.
 */
galleryPlanRoutes.post("/", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as { brainstormId?: string; ideaIdx?: number };
  if (typeof body.brainstormId !== "string" || !body.brainstormId.trim()) {
    return c.json({ error: "Thiếu brainstormId" }, 400);
  }
  if (
    typeof body.ideaIdx !== "number" ||
    !Number.isInteger(body.ideaIdx) ||
    body.ideaIdx < 0
  ) {
    return c.json({ error: "ideaIdx phải là integer ≥ 0" }, 400);
  }

  const session = await getSession(body.brainstormId);
  if (!session) return c.json({ error: "Brainstorm session not found" }, 404);
  if (!isGallerySession(session)) {
    return c.json(
      { error: "Session không phải style=gallery — không thể tạo plan" },
      400,
    );
  }
  const idea = session.ideas[body.ideaIdx];
  if (!idea) return c.json({ error: "ideaIdx out of range" }, 400);

  try {
    const plan = await createPlanFromIdea({
      brainstormId: body.brainstormId,
      ideaIdx: body.ideaIdx,
      idea,
    });
    return c.json(plan, 201);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

/**
 * PUT 1 chapter — patch transcript/status. Body: { transcript?, status? }
 */
galleryPlanRoutes.put("/:id/chapters/:idx", async (c) => {
  const id = c.req.param("id");
  const idx = Number(c.req.param("idx"));
  if (!Number.isInteger(idx) || idx < 0) {
    return c.json({ error: "chapter idx không hợp lệ" }, 400);
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as {
    transcript?: string;
    status?: GalleryPlanChapter["status"];
    visualBeats?: GalleryPlanChapter["visualBeats"];
  };
  if (
    body.status !== undefined &&
    body.status !== "pending" &&
    body.status !== "draft" &&
    body.status !== "approved"
  ) {
    return c.json(
      { error: "status phải là 'pending' | 'draft' | 'approved'" },
      400,
    );
  }
  if (body.visualBeats !== undefined && !Array.isArray(body.visualBeats)) {
    return c.json({ error: "visualBeats phải là array" }, 400);
  }
  try {
    const plan = await updateChapter(id, idx, body);
    if (!plan) return c.json({ error: "Plan not found" }, 404);
    return c.json(plan);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * PUT bulk chapters — body: { chapters: GalleryPlanChapter[] }
 */
galleryPlanRoutes.put("/:id/chapters", async (c) => {
  const id = c.req.param("id");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as { chapters?: GalleryPlanChapter[] };
  if (!Array.isArray(body.chapters)) {
    return c.json({ error: "Body phải có field 'chapters' là array" }, 400);
  }
  try {
    const plan = await updatePlanChapters(id, body.chapters);
    if (!plan) return c.json({ error: "Plan not found" }, 404);
    return c.json(plan);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * LLM gen transcript cho 1 chapter narration. Body: { provider, model }.
 * Sync — chờ LLM xong rồi trả plan đã update.
 */
galleryPlanRoutes.post("/:id/chapters/:idx/generate", async (c) => {
  const id = c.req.param("id");
  const idx = Number(c.req.param("idx"));
  if (!Number.isInteger(idx) || idx < 0) {
    return c.json({ error: "chapter idx không hợp lệ" }, 400);
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as { provider?: string; model?: string };
  if (body.provider !== "openai" && body.provider !== "ollama") {
    return c.json({ error: "provider phải là 'openai' hoặc 'ollama'" }, 400);
  }
  if (typeof body.model !== "string" || !body.model.trim()) {
    return c.json({ error: "Thiếu model" }, 400);
  }
  try {
    const plan = await generateChapterTranscript({
      planId: id,
      chapterIdx: idx,
      provider: body.provider as LLMProvider,
      model: body.model.trim(),
    });
    return c.json(plan);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * Phase 4b: TTS + loudnorm + Whisper alignment cho 1 chapter narration.
 * Body: { voice?, ttsModel?, force? }. Sync (chờ 30-60s).
 */
galleryPlanRoutes.post("/:id/chapters/:idx/audio", async (c) => {
  const id = c.req.param("id");
  const idx = Number(c.req.param("idx"));
  if (!Number.isInteger(idx) || idx < 0) {
    return c.json({ error: "chapter idx không hợp lệ" }, 400);
  }
  const raw = await c.req.json().catch(() => ({}));
  const body = raw as {
    ttsProvider?: string;
    voice?: string;
    ttsModel?: string;
    force?: boolean;
    speakingRate?: number;
    pitch?: number;
    languageCode?: string;
    styleInstruction?: string;
  };
  if (
    body.ttsProvider !== undefined &&
    body.ttsProvider !== "openai" &&
    body.ttsProvider !== "gemini"
  ) {
    return c.json(
      { error: "ttsProvider phải là 'openai' hoặc 'gemini'" },
      400,
    );
  }
  try {
    const plan = await generateChapterAudio({
      planId: id,
      chapterIdx: idx,
      ttsProvider: body.ttsProvider as "openai" | "gemini" | undefined,
      voice: body.voice,
      ttsModel: body.ttsModel,
      force: body.force ?? false,
      speakingRate: body.speakingRate,
      pitch: body.pitch,
      languageCode: body.languageCode,
      styleInstruction: body.styleInstruction,
    });
    return c.json(plan);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * Phase 4d: render 1 chapter thành MP4 qua Remotion. Sync, ~60-90s/chapter.
 * Body optional. Audio URL base lấy từ Host header (cùng host studio server).
 */
galleryPlanRoutes.post("/:id/chapters/:idx/render", async (c) => {
  const id = c.req.param("id");
  const idx = Number(c.req.param("idx"));
  if (!Number.isInteger(idx) || idx < 0) {
    return c.json({ error: "chapter idx không hợp lệ" }, 400);
  }
  // Audio URL base — Remotion bundler fetch audio file qua HTTP từ studio server.
  // Dùng env STUDIO_PORT (default 3001) + localhost vì bundle chạy local.
  const port = process.env.STUDIO_PORT ?? "3001";
  const audioUrlBase = `http://127.0.0.1:${port}`;
  try {
    const result = await renderChapter({
      planId: id,
      chapterIdx: idx,
      audioUrlBase,
    });
    // Return full updated plan để UI refresh state
    const plan = await import("../gallery-plan-store").then((m) =>
      m.getPlan(id),
    );
    return c.json({
      plan,
      outputPath: result.outputPath,
      durationMs: result.durationMs,
    });
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * Phase 4e: concat tất cả chapter MP4 thành 1 final video với chapter markers
 * + sinh youtube-chapters.txt. Sync 10-30s (ffmpeg copy mode, không re-encode).
 */
galleryPlanRoutes.post("/:id/export", async (c) => {
  const id = c.req.param("id");
  try {
    const result = await exportPlan({ planId: id });
    const plan = await import("../gallery-plan-store").then((m) =>
      m.getPlan(id),
    );
    return c.json({
      plan,
      outputPath: result.outputPath,
      outputDurationMs: result.outputDurationMs,
      chaptersTxtPath: result.chaptersTxtPath,
    });
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * Phase 4e.x: upload BGM file (mp3/m4a/wav) cho plan. Multipart, field "bgm".
 */
const BGM_EXTS = ["mp3", "m4a", "wav", "aac"] as const;
galleryPlanRoutes.post("/:id/bgm", async (c) => {
  const id = c.req.param("id");
  const plan = await getPlan(id);
  if (!plan) return c.json({ error: "Plan not found" }, 404);

  const body = await c.req.parseBody();
  const file = body["bgm"];
  if (!file || typeof file === "string" || !(file instanceof File)) {
    return c.json({ error: "Thiếu field 'bgm' (file)" }, 400);
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!BGM_EXTS.includes(ext as (typeof BGM_EXTS)[number])) {
    return c.json(
      {
        error: `Ext không hỗ trợ: .${ext}`,
        accepted: BGM_EXTS.map((e) => `.${e}`),
      },
      400,
    );
  }

  // Xoá BGM cũ (mọi ext) trước khi ghi mới
  if (plan.bgmFilename) {
    const oldPath = path.join(PATHS.TMP_DIR, plan.bgmFilename);
    await fs.unlink(oldPath).catch(() => {
      /* ignore */
    });
  }

  const filename = galleryPlanBgmFilename(id, ext);
  const filePath = path.join(PATHS.TMP_DIR, filename);
  await fs.mkdir(PATHS.TMP_DIR, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buf);

  const updated = await setPlanBgm(id, filename);
  return c.json(updated, 201);
});

/** Phase 4e.x: xoá BGM của plan. */
galleryPlanRoutes.delete("/:id/bgm", async (c) => {
  const id = c.req.param("id");
  const plan = await getPlan(id);
  if (!plan) return c.json({ error: "Plan not found" }, 404);
  if (plan.bgmFilename) {
    const oldPath = path.join(PATHS.TMP_DIR, plan.bgmFilename);
    await fs.unlink(oldPath).catch(() => {
      /* ignore */
    });
  }
  const updated = await clearPlanBgm(id);
  return c.json(updated);
});

galleryPlanRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const ok = await deletePlan(id);
  return c.json({ deleted: ok });
});
