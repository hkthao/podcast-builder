/**
 * CLI ghép & vá audio — test/headless không cần UI.
 *
 *   npx tsx podcast/scripts/comp.ts takes <slug>
 *   npx tsx podcast/scripts/comp.ts transcribe <slug> [--only v5c,v5d]
 *   npx tsx podcast/scripts/comp.ts align <slug> --base <variant> [--min 0.5]
 *   npx tsx podcast/scripts/comp.ts build <slug> --base <variant> --patches p.json
 *   npx tsx podcast/scripts/comp.ts promote <slug>
 *
 * patches.json = [{ baseStartMs, baseEndMs, variant, startMs, endMs }]
 */
import fs from "node:fs";
import {
  listTakes,
  transcribeTake,
  loadSentences,
  alignToBase,
  compFromPatches,
  promoteComp,
  PRIMARY_VARIANT,
  type Patch,
} from "../server/lib/comp";

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const cmd = process.argv[2];
  const slug = process.argv[3];
  if (!cmd || !slug) {
    console.error("Usage: comp.ts <takes|transcribe|align|build|promote> <slug> [opts]");
    process.exit(1);
  }

  if (cmd === "takes") {
    const takes = await listTakes(slug);
    for (const t of takes) {
      console.log(
        `${t.variant.padEnd(10)} ${(t.durationMs / 60000).toFixed(2)}min  ` +
          `${t.hasTranscript ? "✓transcript" : "—"}  ${t.file}`,
      );
    }
    return;
  }

  if (cmd === "transcribe") {
    const only = arg("--only")?.split(",");
    const takes = await listTakes(slug);
    const targets = only
      ? takes.filter((t) => only.includes(t.variant))
      : takes;
    for (const t of targets) {
      process.stdout.write(`transcribe ${t.variant}… `);
      const n = await transcribeTake(slug, t.variant);
      console.log(`${n} câu`);
    }
    return;
  }

  if (cmd === "align") {
    const base = arg("--base") ?? PRIMARY_VARIANT;
    const min = Number(arg("--min") ?? "0");
    const baseSents = loadSentences(slug, base);
    if (baseSents.length === 0) {
      console.error(`Bản nền ${base} chưa có transcript`);
      process.exit(1);
    }
    const takes = await listTakes(slug);
    const candidates = takes
      .filter((t) => t.variant !== base && t.hasTranscript)
      .map((t) => ({ variant: t.variant, sents: loadSentences(slug, t.variant) }))
      .filter((cd) => cd.sents.length > 0);
    const rows = alignToBase(baseSents, candidates);
    console.log(`base=${base} (${baseSents.length} câu), ứng viên: ${candidates.map((c) => c.variant).join(", ")}`);
    for (const r of rows) {
      const best = r.candidates[0];
      if (best && best.score >= min) {
        console.log(
          `#${r.id} [${(r.startMs / 1000).toFixed(1)}-${(r.endMs / 1000).toFixed(1)}s] ${r.text.slice(0, 50)}`,
        );
        for (const cd of r.candidates.slice(0, 2)) {
          console.log(
            `    ${cd.variant} ${cd.score.toFixed(2)} [${(cd.startMs / 1000).toFixed(1)}-${(cd.endMs / 1000).toFixed(1)}s] ${cd.text.slice(0, 45)}`,
          );
        }
      }
    }
    return;
  }

  if (cmd === "build") {
    const base = arg("--base") ?? PRIMARY_VARIANT;
    const pf = arg("--patches");
    if (!pf) {
      console.error("Cần --patches <file.json>");
      process.exit(1);
    }
    const patches = JSON.parse(fs.readFileSync(pf, "utf-8")) as Patch[];
    console.log(`build slug=${slug} base=${base} patches=${patches.length}`);
    const res = await compFromPatches(slug, base, patches);
    console.log("EDL:");
    for (const e of res.edl) {
      console.log(
        `  ${e.variant.padEnd(10)} ${(e.startMs / 1000).toFixed(1)}-${(e.endMs / 1000).toFixed(1)}s`,
      );
    }
    console.log(`✓ ${res.file}  (${(res.durationMs / 60000).toFixed(2)}min)`);
    return;
  }

  if (cmd === "promote") {
    console.log("✓", promoteComp(slug));
    return;
  }

  console.error(`Lệnh lạ: ${cmd}`);
  process.exit(1);
}

main().catch((e: unknown) => {
  console.error("[comp] FAIL:", e);
  process.exit(1);
});
