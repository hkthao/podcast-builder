import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

/**
 * Gắn thẻ mô tả cho pool footage tự quay (input/footage/) bằng LLM vision →
 * để bước footage-plan ĐÁNH GIÁ độ khớp chủ đề. Cache `input/footage/.tags.json`
 * (chạy 1 lần; clip mới mới tag). Xem footage-plan.ts.
 */

export type FootageTag = {
  desc: string; // mô tả ngắn tiếng Việt
  keywords: string[]; // từ khoá tiếng Anh (để so khớp beat)
  people: boolean;
  children: boolean;
};

const MODEL = process.env.FOOTAGE_TAG_MODEL ?? "gpt-4o";
const VIDEO_RE = /\.(mp4|mov|webm|m4v)$/i;

const midFrameJpeg = (video: string): string => {
  const dur = Number(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", video],
      { encoding: "utf-8" },
    ).trim(),
  );
  const ts = Math.max(0, (dur || 2) * 0.4).toFixed(1);
  const out = path.join(os.tmpdir(), `ftag-${path.basename(video)}.jpg`);
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", ts, "-i", video, "-frames:v", "1", "-vf", "scale=512:-1", out,
  ]);
  return out;
};

const SYSTEM = `Bạn gắn thẻ cho clip b-roll dọc dùng làm NỀN video podcast. Nhìn ảnh và trả JSON:
{"desc":"mô tả ngắn tiếng Việt (≤12 từ)","keywords":["3-6 từ khoá tiếng Anh mô tả cảnh/chủ đề/cảm xúc"],"people":true/false,"children":true/false}
keywords là từ khoá CẢNH và CHỦ ĐỀ trừu tượng có thể liên tưởng (vd stream→"water, flow, time, nature, calm"; cemetery→"death, memory, loss"). Chỉ JSON.`;

export async function tagFootagePool(
  footageDir: string,
  { force = false }: { force?: boolean } = {},
): Promise<Record<string, FootageTag>> {
  const tagsPath = path.join(footageDir, ".tags.json");
  let tags: Record<string, FootageTag> = {};
  if (fs.existsSync(tagsPath) && !force) {
    try {
      tags = JSON.parse(fs.readFileSync(tagsPath, "utf-8"));
    } catch {
      tags = {};
    }
  }
  if (!fs.existsSync(footageDir)) return tags;
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[footage-tags] thiếu OPENAI_API_KEY → bỏ qua tagging");
    return tags;
  }
  const openai = new OpenAI();
  const files = fs
    .readdirSync(footageDir)
    .filter((f) => VIDEO_RE.test(f))
    .filter((f) => force || !tags[f]);
  if (files.length === 0) {
    console.log("[footage-tags] tất cả đã tag (cache).");
    return tags;
  }
  console.log(`[footage-tags] tag ${files.length} clip (model ${MODEL})...`);
  for (const f of files) {
    try {
      const jpg = midFrameJpeg(path.join(footageDir, f));
      const b64 = fs.readFileSync(jpg).toString("base64");
      fs.rmSync(jpg, { force: true });
      const res = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Gắn thẻ clip này. Chỉ JSON." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
            ] as any,
          },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}");
      tags[f] = {
        desc: String(parsed.desc ?? "").trim(),
        keywords: Array.isArray(parsed.keywords)
          ? parsed.keywords.map((k: unknown) => String(k).toLowerCase().trim()).filter(Boolean)
          : [],
        people: !!parsed.people,
        children: !!parsed.children,
      };
      console.log(`  ✓ ${f}: ${tags[f].desc} [${tags[f].keywords.join(", ")}]`);
    } catch (e) {
      console.warn(`  ✗ ${f}: ${(e as Error).message}`);
    }
  }
  fs.writeFileSync(tagsPath, JSON.stringify(tags, null, 2));
  console.log(`[footage-tags] ✓ ${tagsPath}`);
  return tags;
}

const isMain = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isMain) {
  const dir = process.argv[2] ?? "input/footage";
  const force = process.argv.includes("--force");
  tagFootagePool(path.resolve(dir), { force }).catch((e: unknown) => {
    console.error("[footage-tags] FAIL:", e);
    process.exit(1);
  });
}
