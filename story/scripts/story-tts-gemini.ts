import "dotenv/config";
/**
 * story-tts-gemini.ts — gen audio từng phần của input/<slug>.story.json bằng Gemini TTS API
 * (cùng model/giọng như AI Studio) → input/<slug>.parts/audio_01.wav…
 * Bản tay (dán AI Studio) vẫn dùng được: story-tts-brief.ts.
 *
 * Phần đã có file → bỏ qua (gen lại 1 phần: --part=N, hoặc xoá file).
 * Xong → npx tsx story/scripts/story-align.ts <slug>
 *
 * API key: provider "gemini" ở trang Settings của app (DB), fallback GEMINI_API_KEY / GOOGLE_API_KEY trong .env.
 * Usage: npx tsx story/scripts/story-tts-gemini.ts <slug> [--part=N] [--model=...] [--voice=Charon --tag=charon] [--pace="..."]
 *   --voice + --tag: gen bản thử giọng khác vào input/<slug>.parts-<tag>/ (không đè bản đang dùng).
 *   --pace: thay câu "Pace: ..." trong director's note (vd nhịp nhanh hơn cho giọng trầm).
 */
import fs from "node:fs";
import path from "node:path";
import { getApiKey } from "../../shared/studio-core/api-keys-store";
import { INPUT_DIR, PART_WORDS_API, buildParts, readStory, resolveTts } from "./story-common";

const DEFAULT_MODEL = "gemini-2.5-pro-preview-tts";
const pcmToWav = (pcm: Buffer, mimeType: string): Buffer => {
  const rate = Number(mimeType.match(/rate=(\d+)/)?.[1] ?? 24000);
  const bits = Number(mimeType.match(/L(\d+)/)?.[1] ?? 16);
  const blockAlign = bits / 8;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * blockAlign, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};

async function synthesize(
  apiKey: string,
  model: string,
  voice: string,
  note: string,
  text: string,
  speakers?: Array<{ name: string; voice: string }>,
) {
  const kind = speakers?.length ? "conversation" : "transcript";
  const prompt = `Read the following ${kind} based on the director's note.\n\n# Director's note\n${note}\n\n## Transcript:\n${text}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      // Độc thoại < 1 để giọng bớt dao động; đối thoại cao hơn cho phản ứng tự nhiên.
      temperature: speakers?.length ? 0.9 : 0.7,
      responseModalities: ["AUDIO"],
      speechConfig: speakers?.length
        ? {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: speakers.map((sp) => ({
                speaker: sp.name,
                voiceConfig: { prebuiltVoiceConfig: { voiceName: sp.voice } },
              })),
            },
          }
        : { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> } }>;
      };
      const inline = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (!inline) throw new Error(`Gemini không trả audio: ${JSON.stringify(json).slice(0, 300)}`);
      return pcmToWav(Buffer.from(inline.data, "base64"), inline.mimeType);
    }
    const msg = (await res.text()).slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = 20 * attempt;
      console.warn(`[story-tts-gemini]   HTTP ${res.status}, thử lại sau ${wait}s…`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    throw new Error(`Gemini HTTP ${res.status}: ${msg}`);
  }
}

async function main() {
  const slug = process.argv[2];
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  if (!slug) {
    console.error("Usage: npx tsx story/scripts/story-tts-gemini.ts <slug> [--part=N] [--model=...] [--voice=X --tag=Y]");
    process.exit(1);
  }
  const apiKey = getApiKey("gemini");
  if (!apiKey) throw new Error("Chưa có API key Gemini — nhập ở trang Settings của app (provider gemini)");

  const story = readStory(slug);
  const model = arg("model") ?? DEFAULT_MODEL;
  // Giọng/chỉ đạo theo series của tập (series.ts → tts), story.json ghi đè được.
  const tts = resolveTts(slug, story);
  const voice = arg("voice") ?? tts.voice;
  const tag = arg("tag");
  const pace = arg("pace");
  const baseNote = tts.note;
  const note = pace ? baseNote.replace(/Pace: [^.]*\./, `Pace: ${pace.replace(/\.$/, "")}.`) : baseNote;
  const only = arg("part") ? Number(arg("part")) : null;

  const parts = buildParts(story, PART_WORDS_API, !!tts.speakers?.length);
  const dir = path.join(INPUT_DIR, tag ? `${slug}.parts-${tag}` : `${slug}.parts`);
  fs.mkdirSync(dir, { recursive: true });
  const voiceDesc = tts.speakers?.length && !arg("voice") ? tts.speakers.map((sp) => `${sp.name}=${sp.voice}`).join(", ") : voice;
  console.log(`[story-tts-gemini] ${slug}: ${parts.length} phần · ${model} · giọng ${voiceDesc}`);

  for (const [i, text] of parts.entries()) {
    const n = i + 1;
    if (only !== null && n !== only) continue;
    const out = path.join(dir, `audio_${String(n).padStart(2, "0")}.wav`);
    if (only === null && fs.existsSync(out)) {
      console.log(`[story-tts-gemini] phần ${n}: đã có → bỏ qua`);
      continue;
    }
    const t = Date.now();
    fs.writeFileSync(out, await synthesize(apiKey, model, voice, note, text, arg("voice") ? undefined : tts.speakers));
    console.log(`[story-tts-gemini] ✓ phần ${n}/${parts.length} (${((Date.now() - t) / 1000).toFixed(0)}s) → ${out}`);
  }
  console.log(`[story-tts-gemini] xong. Nghe QC rồi: npx tsx story/scripts/story-align.ts ${slug}`);
}

main().catch((e: unknown) => {
  console.error("[story-tts-gemini] FAIL:", e);
  process.exit(1);
});
