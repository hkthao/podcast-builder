/**
 * editorial-manual.ts — Claude Code TỰ VIẾT lớp biên tập (chương + trích dẫn) thay
 * gpt-4o (miễn phí, user chốt 2026-10-18). Cùng luật + cùng chuẩn hoá với gen-editorial.ts.
 *
 *   npx tsx podcast/scripts/editorial-manual.ts brief <slug>
 *     → tmp/<slug>.editorial-brief.txt (luật + transcript "[ms] câu") — Claude đọc,
 *       viết JSON {"chapters":[{atMs,title}],"citations":[{atMs,name,source}]}
 *       vào tmp/<slug>.editorial.claude.json
 *   npx tsx podcast/scripts/editorial-manual.ts apply <slug> [file]
 *     → snap atMs về câu thật → tmp/<slug>.editorial.json + config editorialLocked=true
 *       (render regenPlan KHÔNG gọi LLM ghi đè).
 */
import fs from "node:fs";
import path from "node:path";
import type { Transcript } from "../../shared/transcribe/transcribe";
import { EpisodeConfigSchema } from "../src/episode";
import { EDITORIAL_SYSTEM, buildUserContent, normalizeEditorial } from "./gen-editorial";

const TMP = path.resolve("tmp");
const INPUT = path.resolve("input");

const load = (slug: string) => {
  const tp = [path.join(TMP, `${slug}.corrected.json`), path.join(TMP, `${slug}.json`)].find((p) => fs.existsSync(p));
  if (!tp) throw new Error(`Chưa có transcript tmp/${slug}.corrected.json`);
  const transcript = JSON.parse(fs.readFileSync(tp, "utf-8")) as Transcript;
  const cfgPath = path.join(INPUT, `${slug}.json`);
  const raw = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  return { transcript, cfgPath, raw, episode: EpisodeConfigSchema.parse(raw) };
};

function main() {
  const [cmd, slug, file] = process.argv.slice(2);
  if (!slug || (cmd !== "brief" && cmd !== "apply")) {
    console.error("Usage: npx tsx podcast/scripts/editorial-manual.ts brief|apply <slug> [file]");
    process.exit(1);
  }
  const { transcript, cfgPath, raw, episode } = load(slug);

  if (cmd === "brief") {
    const out = path.join(TMP, `${slug}.editorial-brief.txt`);
    fs.writeFileSync(out, `${EDITORIAL_SYSTEM}\n\n=====\n\n${buildUserContent(transcript, episode)}\n`);
    console.log(`[editorial-manual] ✓ ${out}\n  Claude viết JSON → tmp/${slug}.editorial.claude.json rồi chạy apply.`);
    return;
  }

  const src = file ?? path.join(TMP, `${slug}.editorial.claude.json`);
  const parsed = JSON.parse(fs.readFileSync(src, "utf-8")) as { chapters?: unknown; citations?: unknown };
  const offsets = transcript.transcription.filter((s) => s.text.trim()).map((s) => s.offsets.from);
  const editorial = normalizeEditorial(parsed, offsets, offsets[offsets.length - 1] ?? 0);
  const out = path.join(TMP, `${slug}.editorial.json`);
  fs.writeFileSync(out, JSON.stringify(editorial, null, 2));
  fs.writeFileSync(cfgPath, JSON.stringify({ ...raw, editorialLocked: true }, null, 2));
  fs.rmSync(path.join(TMP, `${slug}.plan.json`), { force: true });
  console.log(
    `[editorial-manual] ✓ ${out} — ${editorial.chapters.length} chương, ${editorial.citations.length} trích dẫn · editorialLocked=true`,
  );
}

main();
