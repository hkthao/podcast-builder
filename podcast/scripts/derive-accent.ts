import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { EpisodeConfigSchema, buildEpisodeTemplate } from "../src/episode";

/**
 * Xác định MÀU CHỦ ĐẠO của tập từ ảnh cover (vision) → ghi episode.accentColor.
 * Dùng cho màu SÓNG (visualizer) để đồng bộ với tông ảnh cover. Chạy tự động
 * (thiết kế cho AI agent). Xem Visualizer.tsx.
 */

const MODEL = process.env.ACCENT_MODEL ?? "gpt-4o";

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

/** Đọc màu chủ đạo (hex) từ ảnh bằng vision — chọn màu nổi bật, tránh đen/trắng. */
async function accentFromImage(imgPath: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  // Thu nhỏ để tiết kiệm token.
  const small = path.join(os.tmpdir(), `accent-${path.basename(imgPath)}.jpg`);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", imgPath, "-vf", "scale=384:-1", small]);
  const b64 = fs.readFileSync(small).toString("base64");
  fs.rmSync(small, { force: true });
  const openai = new OpenAI();
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          'Trả JSON {"hex":"#RRGGBB"}. hex = MÀU CHỦ ĐẠO nổi bật, tươi, đại diện cho ảnh (dùng làm màu nhấn thương hiệu). TRÁNH gần đen/trắng/xám; chọn màu có độ bão hoà tốt, đủ tương phản trên nền tối. Chỉ JSON.',
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Màu chủ đạo của ảnh này là gì?" },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ] as any,
      },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });
  const hex = String(JSON.parse(res.choices[0]?.message?.content ?? "{}").hex ?? "").trim();
  if (!HEX_RE.test(hex)) return null;
  return hex.startsWith("#") ? hex : `#${hex}`;
}

export async function deriveAccent(slug: string, apply = true): Promise<string | null> {
  const jsonPath = path.resolve("input", `${slug}.json`);
  const episode = fs.existsSync(jsonPath)
    ? EpisodeConfigSchema.parse(JSON.parse(fs.readFileSync(jsonPath, "utf-8")))
    : EpisodeConfigSchema.parse(buildEpisodeTemplate(slug));
  const coverName = episode.coverImage ?? `${slug}.cover.png`;
  const coverPath = path.resolve("input", coverName);
  if (!fs.existsSync(coverPath)) {
    console.warn(`[accent] không thấy cover ${coverPath} → bỏ qua`);
    return null;
  }
  const hex = await accentFromImage(coverPath);
  if (!hex) {
    console.warn("[accent] không lấy được màu (thiếu key/không hợp lệ)");
    return null;
  }
  console.log(`[accent] ${slug} → màu chủ đạo ${hex} (từ ${coverName})`);
  if (apply) {
    episode.accentColor = hex;
    fs.writeFileSync(jsonPath, JSON.stringify(episode, null, 2));
    console.log(`[accent] ✓ đã ghi episode.accentColor vào ${jsonPath}`);
  }
  return hex;
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
    console.error("Usage: npx tsx podcast/scripts/derive-accent.ts <slug> [--dry]");
    process.exit(1);
  }
  deriveAccent(slug, !process.argv.includes("--dry")).catch((e: unknown) => {
    console.error("[accent] FAIL:", e);
    process.exit(1);
  });
}
