/**
 * TTS endpoint cho Studio UI — wrap OpenAI TTS thành REST endpoint.
 *
 * Khác CLI (gallery/scripts/gen-audio-tts.ts): không cache theo file,
 * không write input/<name>.m4a. UI quyết định lưu đâu (vào input/<slug>.m4a
 * thông qua episode upload flow).
 *
 * Endpoint:
 *   POST /api/llm/tts
 *   body { text, voice?, model? }
 *   → audio/aac binary stream (~few MB cho script dài)
 *
 * Vì OpenAI TTS chỉ chấp nhận ≤4096 chars/request, route này tự chunk
 * + concat AAC. Cho UI: hiện progress qua content-length header sau khi
 * full audio ready.
 */
import { Hono } from "hono";
import OpenAI from "openai";

export const ttsRoutes = new Hono();

const VALID_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;
type Voice = (typeof VALID_VOICES)[number];

const VALID_MODELS = ["tts-1", "tts-1-hd"] as const;
type Model = (typeof VALID_MODELS)[number];

const CHUNK_LIMIT = 4000;
const MAX_TEXT_LENGTH = 100_000; // ~30 phút audio, an toàn cho memory

function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (p.length > CHUNK_LIMIT) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      const sentences = p.split(/(?<=[.!?])\s+/);
      let buf = "";
      for (const s of sentences) {
        if ((buf + " " + s).length > CHUNK_LIMIT && buf.length > 0) {
          chunks.push(buf.trim());
          buf = s;
        } else {
          buf = buf ? `${buf} ${s}` : s;
        }
      }
      if (buf) chunks.push(buf.trim());
      continue;
    }
    if ((current + "\n\n" + p).length > CHUNK_LIMIT && current.length > 0) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

ttsRoutes.post("/", async (c) => {
  if (!process.env.OPENAI_API_KEY) {
    return c.json({ error: "Thiếu OPENAI_API_KEY trong .env" }, 503);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }

  const {
    text,
    voice = "nova",
    model = "tts-1-hd",
  } = body as {
    text?: string;
    voice?: string;
    model?: string;
  };

  if (typeof text !== "string" || text.trim().length === 0) {
    return c.json({ error: "Thiếu field 'text' (string)" }, 400);
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return c.json(
      {
        error: `Text quá dài (${text.length} > ${MAX_TEXT_LENGTH} chars). Chia nhỏ trước.`,
      },
      400,
    );
  }
  if (!(VALID_VOICES as readonly string[]).includes(voice)) {
    return c.json(
      { error: `Voice '${voice}' không hợp lệ. Cho phép: ${VALID_VOICES.join(", ")}` },
      400,
    );
  }
  if (!(VALID_MODELS as readonly string[]).includes(model)) {
    return c.json(
      { error: `Model '${model}' không hợp lệ. Cho phép: ${VALID_MODELS.join(", ")}` },
      400,
    );
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return c.json({ error: "Text không có nội dung" }, 400);
  }

  const openai = new OpenAI();
  try {
    const audioBuffers: Buffer[] = [];
    for (const chunk of chunks) {
      const response = await openai.audio.speech.create({
        model: model as Model,
        voice: voice as Voice,
        input: chunk,
        response_format: "aac",
      });
      const arrayBuf = await response.arrayBuffer();
      audioBuffers.push(Buffer.from(arrayBuf));
    }
    const combined = Buffer.concat(audioBuffers);

    return new Response(combined as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "audio/aac",
        "Content-Length": String(combined.length),
        "Content-Disposition": `attachment; filename="tts-${Date.now()}.m4a"`,
        "X-TTS-Voice": voice,
        "X-TTS-Model": model,
        "X-TTS-Chunks": String(chunks.length),
        "X-TTS-Chars": String(text.length),
      },
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    return c.json(
      {
        error: err.message,
        status: err.status ?? 500,
      },
      500,
    );
  }
});

/** Bảng voice options cho UI dropdown. */
ttsRoutes.get("/voices", (c) => {
  return c.json({
    voices: VALID_VOICES,
    models: VALID_MODELS,
    defaults: { voice: "nova", model: "tts-1-hd" },
  });
});
