import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "../../shared/studio-core/llm-providers";
import { getApiKey } from "../../shared/studio-core/api-keys-store";
import type { Transcript } from "../../shared/transcribe/transcribe";
import {
  EpisodeConfigSchema,
  buildEpisodeTemplate,
  type EpisodeConfig,
} from "../src/episode";
import {
  type Editorial,
  type EditorialChapter,
  type EditorialCitation,
  EMPTY_EDITORIAL,
} from "../src/editorial";

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

// gpt-4o cho chất lượng: định vị trích dẫn ĐÚNG chỗ thảo luận (gpt-4o-mini hay
// dồn tên vào câu tổng quan đầu bài). Xem memory transcript-correct-model-gpt4o.
const MODEL = process.env.EDITORIAL_MODEL ?? "gpt-4o";
const MAX_CHAPTERS = 8;
const MAX_CITATIONS = 7;

const SYSTEM = `Bạn là biên tập viên video cho podcast tiếng Việt "ByteCast Tech" (triết học, tâm lý học, xã hội). Nhiệm vụ: đọc transcript và rút ra LỚP BIÊN TẬP hiển thị trên màn hình, gồm (1) các CHƯƠNG nội dung và (2) các TRÍCH DẪN nhà tư tưởng/thuyết/khái niệm có ghi nguồn.

QUY TẮC:
- Mỗi dòng transcript có dạng "[<ms>] <câu>". Giá trị atMs bạn trả về PHẢI là một trong các số ms đã cho (chọn dòng khớp nhất), KHÔNG bịa số mới.
- chapters: 5-8 chương theo đúng mạch bài. title = tiêu đề NGẮN ≤6 từ, văn nói tự nhiên, TUYỆT ĐỐI KHÔNG dùng "Phần 1/Phần Một/Chương..." hay đánh số. atMs = ms của câu MỞ ĐẦU chương đó.
- citations: mỗi nhân vật/thuyết/khái niệm có thể ghi nguồn (vd Epicurus, Robert Jay Lifton, William James, Sheldon Solomon, Tam bất hủ...) trả 1 mục DUY NHẤT.
  • atMs = thời điểm nhân vật đó được THẢO LUẬN/giải thích sâu, KHÔNG phải chỗ tên bị liệt kê lướt qua trong câu tổng quan đầu bài. Nếu một câu giới thiệu liệt kê nhiều tên cùng lúc, ĐỪNG đặt tất cả vào đó — hãy đặt mỗi tên ở đoạn nó thực sự được bàn.
  • name = tên hiển thị gọn, đúng như audio (giữ tên nước ngoài).
  • source = KHÁI NIỆM/đóng góp gắn với người đó (≤6 từ), KHÔNG ghi chung chung tên ngành. Ví dụ: Sheldon Solomon → "Thuyết quản trị nỗi sợ"; Robert Jay Lifton → "Bất tử biểu tượng"; William James → "Cái tôi xã hội"; Epicurus → "Cái chết không đáng sợ".
  • Tối đa 7, mỗi tên 1 lần. KHÔNG bịa tên không có trong transcript.
- Chỉ trả JSON: {"chapters":[{"atMs":number,"title":string}],"citations":[{"atMs":number,"name":string,"source":string}]}. KHÔNG markdown, KHÔNG lời mở đầu.`;

const buildUserContent = (transcript: Transcript, episode: EpisodeConfig): string => {
  const lines = transcript.transcription
    .filter((s) => s.text.trim().length > 0)
    .map((s) => `[${s.offsets.from}] ${s.text.trim()}`)
    .join("\n");
  const hints = episode.sources.length
    ? `\n\nGợi ý nguồn (dùng để đặt source cho citations nếu khớp):\n${episode.sources.join("\n")}`
    : "";
  return `Tiêu đề tập: ${episode.title}\n\nTranscript (mỗi dòng "[ms] câu"):\n${lines}${hints}\n\nRút chapters + citations theo yêu cầu. Trả JSON.`;
};

const clampToOffsets = <T extends { atMs: number }>(
  items: T[],
  validOffsets: number[],
  maxMs: number,
): T[] => {
  if (validOffsets.length === 0) return [];
  return items
    .map((it) => {
      // Snap atMs về offset gần nhất (LLM đôi khi lệch vài chục ms).
      let best = validOffsets[0];
      let bestDist = Math.abs(it.atMs - best);
      for (const off of validOffsets) {
        const d = Math.abs(it.atMs - off);
        if (d < bestDist) {
          best = off;
          bestDist = d;
        }
      }
      return { ...it, atMs: Math.min(best, maxMs) };
    })
    .sort((a, b) => a.atMs - b.atMs);
};

/**
 * Sinh `tmp/<name>.editorial.json` từ transcript qua LLM.
 * Graceful: thiếu API key / lỗi LLM → ghi editorial RỖNG (overlay không hiện gì),
 * KHÔNG làm hỏng render. Cache-aware như plan (sửa tay được, xoá file để force).
 */
export async function generateEditorial(
  transcriptPath: string,
  episode: EpisodeConfig,
  editorialPath: string,
  { force = false }: { force?: boolean } = {},
): Promise<Editorial> {
  if (fs.existsSync(editorialPath) && !force) {
    const cached = JSON.parse(fs.readFileSync(editorialPath, "utf-8")) as Editorial;
    console.log(
      `[editorial] [cache] skip ${editorialPath} (${cached.chapters.length} chương, ${cached.citations.length} trích dẫn)`,
    );
    return cached;
  }

  const writeEmpty = (reason: string): Editorial => {
    console.warn(`[editorial] ${reason} → ghi editorial rỗng (overlay tắt).`);
    ensureDir(path.dirname(editorialPath));
    const empty = { ...EMPTY_EDITORIAL, generatedAt: new Date().toISOString() };
    fs.writeFileSync(editorialPath, JSON.stringify(empty, null, 2));
    return empty;
  };

  if (!fs.existsSync(transcriptPath)) {
    return writeEmpty(`Transcript không tồn tại: ${transcriptPath}`);
  }
  if (!getApiKey("openai")) {
    return writeEmpty("Thiếu OPENAI_API_KEY");
  }

  const transcript = JSON.parse(
    fs.readFileSync(transcriptPath, "utf-8"),
  ) as Transcript;
  const validOffsets = transcript.transcription
    .filter((s) => s.text.trim().length > 0)
    .map((s) => s.offsets.from);
  const maxMs = validOffsets.length ? validOffsets[validOffsets.length - 1] : 0;

  let raw: string;
  try {
    raw = await chat({
      provider: "openai",
      model: MODEL,
      systemPrompt: SYSTEM,
      userContent: buildUserContent(transcript, episode),
      temperature: 0.4,
      jsonMode: true,
      maxTokens: 1800,
    });
  } catch (e) {
    return writeEmpty(`LLM lỗi: ${(e as Error).message}`);
  }

  let parsed: { chapters?: unknown; citations?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return writeEmpty("LLM trả JSON không hợp lệ");
  }

  const rawChapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
  const rawCitations = Array.isArray(parsed.citations) ? parsed.citations : [];

  const chapters = clampToOffsets(
    rawChapters
      .filter(
        (c): c is EditorialChapter =>
          !!c &&
          typeof (c as EditorialChapter).atMs === "number" &&
          typeof (c as EditorialChapter).title === "string" &&
          (c as EditorialChapter).title.trim().length > 0,
      )
      .map((c) => ({ atMs: c.atMs, title: c.title.trim() }))
      .slice(0, MAX_CHAPTERS),
    validOffsets,
    maxMs,
  );

  const citations = clampToOffsets(
    rawCitations
      .filter(
        (c): c is EditorialCitation =>
          !!c &&
          typeof (c as EditorialCitation).atMs === "number" &&
          typeof (c as EditorialCitation).name === "string" &&
          typeof (c as EditorialCitation).source === "string" &&
          (c as EditorialCitation).name.trim().length > 0,
      )
      .map((c) => ({
        atMs: c.atMs,
        name: c.name.trim(),
        source: c.source.trim(),
      }))
      .slice(0, MAX_CITATIONS),
    validOffsets,
    maxMs,
  );

  const editorial: Editorial = {
    version: 1,
    generatedAt: new Date().toISOString(),
    chapters,
    citations,
  };
  ensureDir(path.dirname(editorialPath));
  fs.writeFileSync(editorialPath, JSON.stringify(editorial, null, 2));
  console.log(
    `[editorial] ✓ ${editorialPath} — ${chapters.length} chương, ${citations.length} trích dẫn`,
  );
  return editorial;
}

const isMain = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: tsx scripts/gen-editorial.ts <slug> [--force]");
    process.exit(1);
  }
  const force = process.argv.includes("--force");
  const transcriptPath = path.resolve("tmp", `${slug}.corrected.json`);
  const fallback = path.resolve("tmp", `${slug}.json`);
  const src = fs.existsSync(transcriptPath) ? transcriptPath : fallback;
  const editorialPath = path.resolve("tmp", `${slug}.editorial.json`);
  const jsonPath = path.resolve("input", `${slug}.json`);
  const episode = fs.existsSync(jsonPath)
    ? EpisodeConfigSchema.parse(JSON.parse(fs.readFileSync(jsonPath, "utf-8")))
    : EpisodeConfigSchema.parse(buildEpisodeTemplate(slug));
  generateEditorial(src, episode, editorialPath, { force }).catch(
    (e: unknown) => {
      console.error("[editorial] FAIL:", e);
      process.exit(1);
    },
  );
}
