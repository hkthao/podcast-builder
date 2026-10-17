import fs from "node:fs";
import path from "node:path";
import { getEffectivePrompt } from "../../shared/studio-core/prompt-overrides-store";
import {
  buildCoverPromptUserContent,
  buildYoutubeCoverPromptUserContent,
} from "../server/lib/cover-prompt-store";
import { EpisodeConfigSchema } from "../src/episode";

/**
 * Prompt tạo ảnh cover do CLAUDE CODE tự viết — KHÔNG gọi OpenAI (miễn phí).
 *
 *   1) npx tsx podcast/scripts/cover-prompt.ts brief <slug> [--landscape]
 *      → in system prompt hiệu lực (có override ở /prompts) + nội dung tập.
 *        Claude đọc, viết output ĐÚNG quy tắc (dòng đầu "THEME_COLOR: #RRGGBB — tên",
 *        rồi prompt đầy đủ) vào 1 file, vd tmp/<slug>.cover-prompt[.yt].txt
 *   2) npx tsx podcast/scripts/cover-prompt.ts apply <slug> <file> [--landscape]
 *      → tách THEME_COLOR, lưu prompt vào config (coverPrompt / coverPromptLandscape).
 *        Bản 9:16: tập chưa có accentColor thì set luôn màu chủ đề (màu sóng).
 *
 * UI (Render → tab khung → "Prompt tạo ảnh cover") hiển thị prompt đã lưu để copy.
 */

const usage = () => {
  console.error(
    "Usage:\n  npx tsx podcast/scripts/cover-prompt.ts brief <slug> [--landscape]\n" +
      "  npx tsx podcast/scripts/cover-prompt.ts apply <slug> <file> [--landscape]",
  );
  process.exit(1);
};

const [cmd, slug, fileArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const landscape = process.argv.includes("--landscape");
if (!cmd || !slug) usage();

const jsonPath = path.resolve("input", `${slug}.json`);
if (!fs.existsSync(jsonPath)) {
  console.error(`Không có config: ${jsonPath}`);
  process.exit(1);
}
const readConfig = () =>
  EpisodeConfigSchema.parse(JSON.parse(fs.readFileSync(jsonPath, "utf-8")));

if (cmd === "brief") {
  const ep = readConfig();
  const system = getEffectivePrompt(
    landscape ? "podcast.cover-prompt-yt" : "podcast.cover-prompt",
  );
  const user = landscape
    ? buildYoutubeCoverPromptUserContent(ep.title, ep.hook, ep.accentColor)
    : buildCoverPromptUserContent(ep.title, ep.hook);
  console.log(`===== SYSTEM (${landscape ? "thumbnail YouTube 16:9" : "cover Reels 9:16"}) =====`);
  console.log(system);
  console.log("\n===== NỘI DUNG TẬP =====");
  console.log(user);
  const essay = path.resolve("input", `${slug}.essay.txt`);
  if (fs.existsSync(essay)) console.log(`\n(Bài luận để hiểu chủ đề: ${essay})`);
  console.log(
    `\n→ Viết output vào file rồi: npx tsx podcast/scripts/cover-prompt.ts apply ${slug} <file>${landscape ? " --landscape" : ""}`,
  );
} else if (cmd === "apply") {
  if (!fileArg || !fs.existsSync(fileArg)) usage();
  let text = fs.readFileSync(fileArg!, "utf-8").trim();
  let themeColor: string | null = null;
  const m = text.match(/^\s*THEME_COLOR:\s*(#[0-9a-fA-F]{6})[^\n]*\n+/);
  if (m) {
    themeColor = m[1];
    text = text.slice(m[0].length).trim();
  }
  if (!text) {
    console.error("Prompt rỗng.");
    process.exit(1);
  }
  // Đọc lại config ngay trước khi ghi (tránh đè thay đổi từ UI).
  const ep = readConfig();
  if (landscape) {
    ep.coverPromptLandscape = text;
  } else {
    ep.coverPrompt = text;
    if (themeColor && !ep.accentColor) ep.accentColor = themeColor;
  }
  fs.writeFileSync(jsonPath, JSON.stringify(ep, null, 2));
  console.log(
    `✓ Lưu ${landscape ? "coverPromptLandscape" : "coverPrompt"} (${text.length} ký tự)` +
      (themeColor ? ` · THEME_COLOR ${themeColor}${!landscape && ep.accentColor === themeColor ? " (đã đặt làm màu sóng)" : ""}` : ""),
  );
} else {
  usage();
}
