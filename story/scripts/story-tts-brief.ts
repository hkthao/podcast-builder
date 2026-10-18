/**
 * story-tts-brief.ts — kịch bản input/<slug>.story.json → input/<slug>.tts.md để
 * dán vào Google AI Studio (Speech). AI Studio gen tối đa ~1'30/lần → chia PHẦN
 * ≤ MAX_WORDS chữ, cắt ở ranh giới câu (ưu tiên ranh giới section).
 *
 * User gen từng phần → lưu input/<slug>.parts/audio_01.wav, audio_02.wav…
 * → npx tsx story/scripts/story-align.ts <slug>
 *
 * Usage: npx tsx story/scripts/story-tts-brief.ts <slug>
 */
import fs from "node:fs";
import path from "node:path";
import { INPUT_DIR, buildParts, readStory, wordCount } from "./story-common";

// Đã nghe duyệt 2026-10-18: tốc độ THƯỜNG (user từ chối bản kể chậm/trầm lắng).
export const AUDIO_PROFILE =
  "A warm, wise Vietnamese storyteller from Hanoi telling a classic moral tale. Calm and grounded but engaging, like a skilled audiobook narrator. Northern Vietnamese (Hanoi) accent, clear tones.";
export const SCENE =
  'A quiet evening in an old Vietnamese village house. A storyteller sits by a warm oil lamp, sharing a classic tale from "Cổ học tinh hoa". Peaceful, intimate — NOT eerie, NOT a ghost story.';
export const SAMPLE_CONTEXT =
  "The storyteller speaks at a natural, steady narration pace — like a good audiobook narrator, not slow. Short natural breath at commas, a brief pause at the end of each sentence. Warm, gentle rise and fall. When quoting a character, the voice shifts slightly. Never dragging, never dramatic.";

function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx story/scripts/story-tts-brief.ts <slug>");
    process.exit(1);
  }
  const story = readStory(slug);

  const parts = buildParts(story);

  const voice = story.geminiVoice ?? "<giọng đã khoá cho series>";
  const out: string[] = [
    `# ${story.title}`,
    "",
    "Google AI Studio → **Speech** (single speaker). Giữ NGUYÊN cấu hình dưới cho mọi phần để giọng đều.",
    "",
    "## Speaker settings",
    `- **Voice:** ${voice}`,
    "- **Director's note:** Pace = **Normal** · Style/Accent để trống",
    "- **Audio Profile:**",
    "```",
    AUDIO_PROFILE,
    "```",
    "",
    "**Scene:**",
    "```",
    SCENE,
    "```",
    "",
    "**Sample Context:**",
    "```",
    SAMPLE_CONTEXT,
    "```",
    "",
    `## Lời đọc — ${parts.length} phần`,
    `Gen từng phần → lưu \`input/${slug}.parts/audio_01.wav\`, \`audio_02.wav\`… (đúng thứ tự).`,
    "Phần nào đọc sai/vấp → gen lại riêng phần đó, ghi đè file.",
    "",
  ];
  parts.forEach((text, i) => {
    const n = String(i + 1).padStart(2, "0");
    out.push(`### Phần ${i + 1} · audio_${n} (${wordCount(text)} chữ)`, "```", text, "```", "");
  });
  out.push(
    "## Sau khi gen xong",
    "```bash",
    `npx tsx story/scripts/story-align.ts ${slug}`,
    "```",
  );

  const mdPath = path.join(INPUT_DIR, `${slug}.tts.md`);
  fs.writeFileSync(mdPath, out.join("\n"));
  fs.mkdirSync(path.join(INPUT_DIR, `${slug}.parts`), { recursive: true });
  console.log(`[story-tts-brief] ✓ ${mdPath} · ${parts.length} phần`);
}

if (process.argv[1]?.endsWith("story-tts-brief.ts")) main();
