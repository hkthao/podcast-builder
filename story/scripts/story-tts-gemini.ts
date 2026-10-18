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
import { INPUT_DIR, PART_WORDS_API, buildParts, readStory } from "./story-common";

const DEFAULT_MODEL = "gemini-2.5-pro-preview-tts";
const DEFAULT_VOICE = "Autonoe";
// Director's note user chỉnh trên AI Studio (2026-10-18) + KHOÁ giọng Bắc: thiếu dòng Accent
// thì Gemini tự chọn giọng mỗi lần gen → lẫn Nam/Bắc giữa các phần. Sửa từng tập qua story.json.
const DEFAULT_NOTE =
  "Style: Warm, understanding, soft tone with gentle inflections. Pace: Natural conversational pace. " +
  "Accent: Northern Vietnamese (Hanoi) accent with standard Hanoi pronunciation, kept exactly the same from the first sentence to the last — never Southern Vietnamese. " +
  "Keep the same voice, tone and energy throughout the whole transcript.";

/** PCM 16-bit mono (Gemini trả audio/L16;rate=24000) → WAV. */
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

async function synthesize(apiKey: string, model: string, voice: string, note: string, text: string) {
  const prompt = `Read the following transcript based on the director's note.\n\n# Director's note\n${note}\n\n## Transcript:\n${text}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      // < 1 để giọng bớt dao động giữa các câu.
      temperature: 0.7,
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
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
  const voice = arg("voice") ?? story.geminiVoice ?? DEFAULT_VOICE;
  const tag = arg("tag");
  const pace = arg("pace");
  const baseNote = story.geminiDirectorNote ?? DEFAULT_NOTE;
  const note = pace ? baseNote.replace(/Pace: [^.]*\./, `Pace: ${pace.replace(/\.$/, "")}.`) : baseNote;
  const only = arg("part") ? Number(arg("part")) : null;

  const parts = buildParts(story, PART_WORDS_API);
  const dir = path.join(INPUT_DIR, tag ? `${slug}.parts-${tag}` : `${slug}.parts`);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`[story-tts-gemini] ${slug}: ${parts.length} phần · ${model} · giọng ${voice}`);

  for (const [i, text] of parts.entries()) {
    const n = i + 1;
    if (only !== null && n !== only) continue;
    const out = path.join(dir, `audio_${String(n).padStart(2, "0")}.wav`);
    if (only === null && fs.existsSync(out)) {
      console.log(`[story-tts-gemini] phần ${n}: đã có → bỏ qua`);
      continue;
    }
    const t = Date.now();
    fs.writeFileSync(out, await synthesize(apiKey, model, voice, note, text));
    console.log(`[story-tts-gemini] ✓ phần ${n}/${parts.length} (${((Date.now() - t) / 1000).toFixed(0)}s) → ${out}`);
  }
  console.log(`[story-tts-gemini] xong. Nghe QC rồi: npx tsx story/scripts/story-align.ts ${slug}`);
}

main().catch((e: unknown) => {
  console.error("[story-tts-gemini] FAIL:", e);
  process.exit(1);
});
