import { Hono } from "hono";
import {
  AUDIO_EXTENSIONS,
  BGM_EXTENSIONS,
  COVER_EXTENSIONS,
  createEmptyEpisode,
  deleteCover,
  deleteEpisodeBgm,
  deleteEpisodeFile,
  replaceEpisodeAudio,
  uploadEpisodeBgm,
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
  uploadCover,
} from "../lib/episode-store";
import {
  genSceneThumbnails,
  listSceneThumbnails,
} from "../lib/scene-thumbnails";
import {
  deleteScript,
  generateScript,
  loadScript,
  saveScript,
  type Speaker,
} from "../lib/script-store";
import {
  generateScriptAudio,
  type TtsVoiceConfig,
} from "../../../shared/studio-core/podcast-script-tts";
import { buildCoverPromptUserContent } from "../lib/cover-prompt-store";
import { chat } from "../../../shared/studio-core/llm-providers";
import { getEffectivePrompt } from "../../../shared/studio-core/prompt-overrides-store";
import {
  ALL_VOICES,
  DEFAULT_HOST_NAM_VOICE,
  DEFAULT_HOST_NU_VOICE,
} from "../../../shared/studio-core/tts-providers/voice-catalog";
import { mixBgmIntoVoice } from "../../../shared/audio/bgm-mix";
import { PATHS } from "../../../shared/studio-core/paths";
import path from "node:path";
import fs from "node:fs/promises";
import type { LLMProvider } from "../../../shared/studio-core/llm-providers";

export const episodesRoutes = new Hono();

episodesRoutes.get("/", async (c) => {
  const styleParam = c.req.query("style");
  const style =
    styleParam === "gallery" || styleParam === "podcast" ? styleParam : undefined;
  const episodes = await listEpisodes(style ? { style } : {});
  return c.json({ episodes });
});

/**
 * Tạo episode TRỐNG (chỉ config .json, chưa có audio). User dùng tab
 * Kịch bản để gen audio TTS sau. Body: { title, hook?, essayId?, style? }
 */
episodesRoutes.post("/", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as {
    title?: string;
    hook?: string | null;
    essayId?: string | null;
    style?: string;
  };
  if (typeof body.title !== "string" || !body.title.trim()) {
    return c.json({ error: "Cần field 'title' (string)" }, 400);
  }
  if (body.style && body.style !== "podcast" && body.style !== "gallery") {
    return c.json({ error: "style phải là 'podcast' hoặc 'gallery'" }, 400);
  }
  try {
    const summary = await createEmptyEpisode({
      title: body.title,
      hook: body.hook,
      essayId: body.essayId ?? undefined,
      style: body.style as "podcast" | "gallery" | undefined,
    });
    return c.json(summary, 201);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
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
  // Optional: style — "podcast" (default) hoặc "gallery"
  const styleField = body["style"];
  const style =
    styleField === "gallery" || styleField === "podcast"
      ? (styleField as "podcast" | "gallery")
      : "podcast";
  // Optional: cover image trong cùng request
  const coverFile = body["cover"];
  let cover: { originalName: string; buffer: Uint8Array } | undefined;
  if (coverFile && typeof coverFile !== "string" && coverFile instanceof File) {
    const coverExt = (coverFile.name.split(".").pop() ?? "").toLowerCase();
    if (!COVER_EXTENSIONS.includes(coverExt as (typeof COVER_EXTENSIONS)[number])) {
      return c.json(
        {
          error: `Cover ext không hỗ trợ: .${coverExt}`,
          accepted: COVER_EXTENSIONS.map((e) => `.${e}`),
        },
        400,
      );
    }
    cover = {
      originalName: coverFile.name,
      buffer: new Uint8Array(await coverFile.arrayBuffer()),
    };
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  try {
    const summary = await uploadAudio(file.name, buf, { essayId, cover, style });
    return c.json(summary, 201);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * Upload cover image cho episode đã có. Ghi đè cover cũ.
 * Content-Type: multipart/form-data, field "cover".
 */
episodesRoutes.post("/:name/cover", async (c) => {
  const name = c.req.param("name");
  const body = await c.req.parseBody();
  const file = body["cover"];
  if (!file || typeof file === "string" || !(file instanceof File)) {
    return c.json({ error: "Thiếu field 'cover' (file)" }, 400);
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!COVER_EXTENSIONS.includes(ext as (typeof COVER_EXTENSIONS)[number])) {
    return c.json(
      {
        error: `Cover ext không hỗ trợ: .${ext}`,
        accepted: COVER_EXTENSIONS.map((e) => `.${e}`),
      },
      400,
    );
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  try {
    const summary = await uploadCover(name, file.name, buf);
    return c.json(summary);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "VALIDATION" ? 400 : err.code === "NOT_FOUND" ? 404 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * Upload audio cho episode CÓ SẴN — replace audio cũ khác extension.
 * Multipart, field "audio".
 */
episodesRoutes.post("/:name/audio", async (c) => {
  const name = c.req.param("name");
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
    const summary = await replaceEpisodeAudio(name, file.name, buf);
    return c.json(summary);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "VALIDATION" ? 400 : err.code === "NOT_FOUND" ? 404 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * Upload BGM cho episode. Multipart, field "bgm". Ghi `input/{slug}.bgm.{ext}`,
 * update config.bgm = filename.
 */
episodesRoutes.post("/:name/bgm", async (c) => {
  const name = c.req.param("name");
  const body = await c.req.parseBody();
  const file = body["bgm"];
  if (!file || typeof file === "string" || !(file instanceof File)) {
    return c.json({ error: "Thiếu field 'bgm' (file)" }, 400);
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!BGM_EXTENSIONS.includes(ext as (typeof BGM_EXTENSIONS)[number])) {
    return c.json(
      {
        error: `BGM ext không hỗ trợ: .${ext}`,
        accepted: BGM_EXTENSIONS.map((e) => `.${e}`),
      },
      400,
    );
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  try {
    const summary = await uploadEpisodeBgm(name, file.name, buf);
    return c.json(summary);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "VALIDATION" ? 400 : err.code === "NOT_FOUND" ? 404 : 500;
    return c.json({ error: err.message }, status);
  }
});

/** Xoá BGM file + clear config.bgm. */
episodesRoutes.delete("/:name/bgm", async (c) => {
  const name = c.req.param("name");
  try {
    const summary = await deleteEpisodeBgm(name);
    return c.json(summary);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "VALIDATION" ? 400 : err.code === "NOT_FOUND" ? 404 : 500;
    return c.json({ error: err.message }, status);
  }
});

/** Xóa cover image + clear config.coverImage. */
episodesRoutes.delete("/:name/cover", async (c) => {
  const name = c.req.param("name");
  try {
    const summary = await deleteCover(name);
    return c.json(summary);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "VALIDATION" ? 400 : err.code === "NOT_FOUND" ? 404 : 500;
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

// ────── Podcast script gen + audio gen (Phase: dialogue 2 voice) ──────

/**
 * Voice catalog — toàn bộ Gemini + OpenAI voices với mô tả tiếng Việt.
 * UI dropdown đọc từ đây để render label rõ ràng cho user pick.
 */
episodesRoutes.get("/_/voices", (c) =>
  c.json({
    voices: ALL_VOICES,
    defaults: {
      hostNam: DEFAULT_HOST_NAM_VOICE,
      hostNu: DEFAULT_HOST_NU_VOICE,
    },
  }),
);

/**
 * Load script sidecar `input/{slug}.script.json`. null nếu chưa gen.
 */
episodesRoutes.get("/:name/script", async (c) => {
  const name = c.req.param("name");
  const script = await loadScript(name);
  return c.json(script);
});

/**
 * Gen kịch bản 2 voice qua LLM. Body:
 *   { provider, model, essayId?, brainstormRef?, extraNotes, targetMinutes? }
 * Sync — chờ LLM trả JSON (~10-30s).
 */
episodesRoutes.post("/:name/script/generate", async (c) => {
  const name = c.req.param("name");
  const ep = await getEpisode(name);
  if (!ep) return c.json({ error: `Episode not found: ${name}` }, 404);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as {
    provider?: string;
    model?: string;
    essayId?: string | null;
    brainstormRef?: { id: string; ideaIdx: number } | null;
    extraNotes?: string;
    targetMinutes?: number;
  };
  if (body.provider !== "openai" && body.provider !== "ollama") {
    return c.json({ error: "provider phải là 'openai' hoặc 'ollama'" }, 400);
  }
  if (typeof body.model !== "string" || !body.model.trim()) {
    return c.json({ error: "Thiếu model" }, 400);
  }
  try {
    const script = await generateScript({
      episodeName: name,
      essayId: body.essayId ?? null,
      brainstormRef: body.brainstormRef ?? null,
      extraNotes: body.extraNotes ?? "",
      title: ep.config.title,
      hook: ep.config.hook,
      targetMinutes: body.targetMinutes,
      provider: body.provider as LLMProvider,
      model: body.model.trim(),
    });
    return c.json(script);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status =
      err.code === "VALIDATION" ? 400 : err.code === "NOT_FOUND" ? 404 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * Lưu script sau khi user edit. Body: { turns, extraNotes? }
 */
episodesRoutes.put("/:name/script", async (c) => {
  const name = c.req.param("name");
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const body = raw as {
    turns?: Array<{ speaker: string; text: string }>;
    extraNotes?: string;
  };
  if (!Array.isArray(body.turns)) {
    return c.json({ error: "Body phải có field 'turns' là array" }, 400);
  }
  try {
    const existing = await loadScript(name);
    const script = await saveScript(name, {
      turns: body.turns as Array<{ speaker: Speaker; text: string }>,
      source:
        body.extraNotes !== undefined && existing
          ? { ...existing.source, extraNotes: body.extraNotes }
          : existing?.source,
    });
    return c.json(script);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

/** Xoá script (reset). */
episodesRoutes.delete("/:name/script", async (c) => {
  const name = c.req.param("name");
  const deleted = await deleteScript(name);
  return c.json({ deleted });
});

/**
 * Gen audio từ script — TTS turn-by-turn 2 voice + concat + loudnorm.
 * Body:
 *   {
 *     ttsModel?: string,
 *     hostNam: { voice, styleInstruction },
 *     hostNu: { voice, styleInstruction },
 *     mixBgm?: boolean,
 *     turnGapMs?: number,
 *     force?: boolean
 *   }
 * Sync ~60-120s tuỳ độ dài script.
 */
episodesRoutes.post("/:name/script/audio", async (c) => {
  const name = c.req.param("name");
  const ep = await getEpisode(name);
  if (!ep) return c.json({ error: `Episode not found: ${name}` }, 404);

  const script = await loadScript(name);
  if (!script || script.turns.length === 0) {
    return c.json({ error: "Chưa có script — gen kịch bản trước." }, 400);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const body = raw as {
    ttsModel?: string;
    hostNam?: { voice?: string; styleInstruction?: string };
    hostNu?: { voice?: string; styleInstruction?: string };
    mixBgm?: boolean;
    turnGapMs?: number;
    force?: boolean;
  };
  if (
    !body.hostNam?.voice ||
    !body.hostNu?.voice ||
    typeof body.hostNam.styleInstruction !== "string" ||
    typeof body.hostNu.styleInstruction !== "string"
  ) {
    return c.json(
      {
        error:
          "Cần đủ hostNam + hostNu với voice (id Gemini) và styleInstruction.",
      },
      400,
    );
  }

  try {
    const voices: Record<Speaker, TtsVoiceConfig> = {
      host_nam: {
        voice: body.hostNam.voice as TtsVoiceConfig["voice"],
        styleInstruction: body.hostNam.styleInstruction,
      },
      host_nu: {
        voice: body.hostNu.voice as TtsVoiceConfig["voice"],
        styleInstruction: body.hostNu.styleInstruction,
      },
    };
    const result = await generateScriptAudio({
      episodeName: name,
      script,
      ttsModel: body.ttsModel as
        | Parameters<typeof generateScriptAudio>[0]["ttsModel"]
        | undefined,
      voices,
      turnGapMs: body.turnGapMs,
      force: body.force,
    });

    // Optional BGM mix — chỉ khi user enable + episode có bgm filename set
    let bgmMixed: { path: string; durationMs: number } | null = null;
    if (body.mixBgm && ep.config.bgm) {
      const bgmPath = path.join(PATHS.INPUT_DIR, ep.config.bgm);
      try {
        await fs.access(bgmPath);
      } catch {
        return c.json(
          {
            error: `BGM file không tồn tại: input/${ep.config.bgm}. Upload BGM rồi thử lại.`,
          },
          400,
        );
      }
      const mix = await mixBgmIntoVoice({
        voicePath: result.outputPath,
        bgmPath,
        episodeName: name,
        bgmVolumeDb: ep.config.bgmVolumeDb,
      });
      // Ghi đè audio gốc bằng version có BGM
      await fs.rename(mix.outputPath, result.outputPath);
      bgmMixed = {
        path: result.outputPath,
        durationMs: mix.durationMs,
      };
    }

    const updated = await getEpisode(name);
    return c.json({
      episode: updated,
      audioPath: result.outputPath,
      durationMs: bgmMixed?.durationMs ?? result.durationMs,
      turnCount: result.turnCount,
      bgmMixed: bgmMixed !== null,
    });
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
});

/**
 * Gen prompt tạo ảnh cover (Midjourney/Flux/DALL-E) cho episode. LLM dùng
 * system prompt từ /prompts (key "podcast.cover-prompt") + title + hook.
 * Trả về text prompt. KHÔNG persist — user copy hoặc edit.
 */
episodesRoutes.post("/:name/cover-prompt", async (c) => {
  const name = c.req.param("name");
  const ep = await getEpisode(name);
  if (!ep) return c.json({ error: `Episode not found: ${name}` }, 404);

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
    const content = await chat({
      provider: body.provider as LLMProvider,
      model: body.model.trim(),
      systemPrompt: getEffectivePrompt("podcast.cover-prompt"),
      userContent: buildCoverPromptUserContent(ep.config.title, ep.config.hook),
      temperature: 0.7,
    });
    return c.json({ prompt: content.trim() });
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === "VALIDATION" ? 400 : 500;
    return c.json({ error: err.message }, status);
  }
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
