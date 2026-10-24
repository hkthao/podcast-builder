/**
 * nlm-batch.ts — phần MÁY MÓC của pipeline NotebookLM (ByteCast) gói trong 1 lệnh, để Claude
 * không tốn token poll/tải/chọn bản. Claude chỉ viết 3 file đầu vào:
 *   input/<slug>.essay.txt     bài luận (theo notebooklm-podcast/references/essay-pattern.md)
 *   input/<slug>.focus.txt     prompt --focus (tiếng Anh, chuỗi Việt trong "...")
 *   input/<slug>.sources.txt   URL nguồn, mỗi dòng 1 URL (đã kiểm crawl được)
 *
 * Script: tạo notebook (hoặc dùng --notebook=<id>) → nạp bài luận + URL → gen N bản audio
 * (--takes, mặc định 2) → poll `studio status --json` → tải từng bản → cắt đuôi im lặng →
 * chọn bản 14–18' gần 16' nhất → input/<slug>.m4a. Trạng thái lưu tmp/<slug>.nlm.json
 * → chạy lại tiếp tục được (không tạo notebook/nạp nguồn lại; --takes=N gen THÊM N bản).
 *
 * Usage: npx tsx podcast/scripts/nlm-batch.ts <slug> [--takes=2] [--notebook=<id>] [--profile=<name>] [--force]
 *   [--min=14 --max=20 --target=16 --length=default]  (mặc định theo series — SERIES_GATE;
 *   chuyen-xua / dong-ho-viet = Video Overview explainer 1 người kể → tách tiếng)
 * Exit: 0 = đã chọn được bản đạt · 2 = chưa có bản trong cổng thời lượng (chạy lại với --takes=1 / đổi profile) · 1 = lỗi.
 *
 * Quota (user xác nhận 2026-10-18): Plus 6 audio / 5 giờ; tài khoản khác 3. "Rate limited" khi
 * create vẫn có thể đã tạo bản ma → script KHÔNG tự create lại, đọc status để đếm.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { currentProfile, markExhausted, record, status as quotaStatus } from "./nlm-quota";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

/**
 * Cổng thời lượng + độ dài gen theo series (config.series của tập). Ghi đè bằng
 * --min= --max= --target= --length=.
 * - ByteCast: 14–20' (user 2026-10-18: ~19' vẫn ổn nếu audio đủ chất lượng), length default.
 * - Tiền & Tâm Lý: podcast NGẮN (user 2026-10-20) — NotebookLM thay Gemini TTS, length short.
 */
type Gate = { min: number; max: number; target: number; length: string; kind?: "audio" | "video"; videoStyle?: string; takes?: number };
const SERIES_GATE: Record<string, Gate> = {
  "tien-tam-ly": { min: 4, max: 10, target: 7, length: "short" },
  // Chuyện Xưa (user 2026-10-20): MỘT người kể ≥5' → audio overview không làm được (deep_dive luôn
  // 2 host, brief chỉ ~1.5') → Video Overview "explainer" (1 người thuyết minh, tiếng Việt OK, thử
  // "Tái ông mất ngựa" ra 9.2' giọng Bắc) rồi TÁCH TIẾNG. Video tốn quota hơn → mặc định 1 bản.
  "chuyen-xua": { min: 5, max: 15, target: 8, length: "default", kind: "video", videoStyle: "heritage", takes: 1 },
  // Dòng Họ Việt (user 2026-10-21): bỏ Gemini TTS → cùng luồng 1 người kể như Chuyện Xưa, 5–8'.
  "dong-ho-viet": { min: 5, max: 12, target: 7, length: "default", kind: "video", videoStyle: "heritage", takes: 1 },
};
const seriesOf = (slug: string): string => {
  try {
    return JSON.parse(fs.readFileSync(path.join("input", `${slug}.json`), "utf-8")).series ?? "bytecast";
  } catch {
    return "bytecast";
  }
};
const GATE: Gate = SERIES_GATE[seriesOf(process.argv[2] ?? "")] ?? { min: 14, max: 20, target: 16, length: "default" };
const KIND = GATE.kind ?? "audio";
const MIN_MIN = Number(arg("min") ?? GATE.min);
const MAX_MIN = Number(arg("max") ?? GATE.max);
const TARGET_MIN = Number(arg("target") ?? GATE.target);
const LENGTH = arg("length") ?? GATE.length;
const POLL_SEC = 45;
const POLL_MAX_MIN = 40;

const ENV = { ...process.env, PATH: `${process.env.HOME}/.local/bin:/opt/homebrew/bin:${process.env.PATH}` };

const log = (m: string) => console.log(`[nlm-batch] ${m}`);

function nlm(args: string[], opts: { json?: boolean } = {}): string {
  const r = spawnSync("nlm", args, { env: ENV, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`nlm ${args[0]} ${args[1] ?? ""}: ${(r.stderr || r.stdout).trim().slice(0, 400)}`);
  return opts.json ? r.stdout.slice(r.stdout.search(/[[{]/)) : r.stdout;
}

const durationMin = (f: string) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf-8" })) / 60;

/** Cắt đuôi im lặng ≥3s (NotebookLM hay để ~90s dead air sau outro) — giữ 1.5s đệm. */
function trimTrailingSilence(f: string): number {
  const out = spawnSync("ffmpeg", ["-i", f, "-af", "silencedetect=n=-40dB:d=3", "-f", "null", "-"], { encoding: "utf-8" }).stderr;
  const starts = [...out.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...out.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const total = durationMin(f) * 60;
  const last = starts[starts.length - 1];
  // Khoảng lặng cuối không có silence_end (kéo tới hết file) → cắt.
  if (last === undefined || ends.length >= starts.length || total - last < 3) return 0;
  const tmp = f.replace(/\.m4a$/, ".trim.m4a");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", f, "-t", String(last + 1.5), "-c", "copy", tmp]);
  fs.renameSync(tmp, f);
  return total - (last + 1.5);
}

type State = { notebookId: string; sourcesAdded: boolean; artifacts: string[]; takes: Record<string, { file: string; minutes: number }> };

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx podcast/scripts/nlm-batch.ts <slug> [--takes=2] [--notebook=<id>] [--profile=<name>] [--force]");
    process.exit(1);
  }
  const input = path.resolve("input");
  const statePath = path.resolve("tmp", `${slug}.nlm.json`);
  const read = (ext: string) => {
    const p = [path.join(input, `${slug}.${ext}`), path.resolve("tmp", `${slug}.${ext}`)].find((x) => fs.existsSync(x));
    return p ? fs.readFileSync(p, "utf-8").trim() : null;
  };
  const essay = read("essay.txt");
  const focus = read("focus.txt");
  const urls = (read("sources.txt") ?? "").split(/\s+/).filter((u) => /^https?:\/\//.test(u));
  if (!essay || !focus) throw new Error(`Thiếu input/${slug}.essay.txt hoặc ${slug}.focus.txt`);

  const profile = arg("profile");
  if (profile) {
    nlm(["login", "switch", profile]); // download audio KHÔNG có --profile → đổi default
    log(`profile mặc định: ${profile}`);
  }

  let st: State = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf-8"))
    : { notebookId: arg("notebook") ?? "", sourcesAdded: !!arg("notebook"), artifacts: [], takes: {} };
  const save = () => fs.writeFileSync(statePath, JSON.stringify(st, null, 2));

  // 1. Notebook
  if (!st.notebookId) {
    const title = (essay.split("\n")[0] || slug).slice(0, 90);
    const nb = JSON.parse(nlm(["notebook", "create", title, "--json"], { json: true }));
    st.notebookId = nb.id ?? nb.notebook_id ?? nb.notebook?.id;
    if (!st.notebookId) throw new Error("Không đọc được id notebook mới");
    save();
    log(`tạo notebook ${st.notebookId}`);
  }
  const NB = st.notebookId;

  // 2. Nguồn
  if (!st.sourcesAdded) {
    nlm(["source", "add", NB, "--text", essay, "--title", "Bài luận gốc", "--wait"]);
    if (urls.length) nlm(["source", "add", NB, ...urls.flatMap((u) => ["--url", u]), "--wait", "--wait-timeout", "600"]);
    st.sourcesAdded = true;
    save();
    log(`nạp bài luận + ${urls.length} URL`);
  }

  // KIND "video": Video Overview explainer (1 người thuyết minh) — chỉ lấy tiếng.
  const audioArtifacts = () =>
    (JSON.parse(nlm(["studio", "status", NB, "--json"], { json: true })) as Array<{ id: string; type: string; status: string }>).filter(
      (a) => a.type === KIND,
    );

  // 3. Gen thêm N bản (đếm qua status, không tin exit code create — bẫy bản ma)
  const want = Number(arg("takes") ?? (st.artifacts.length ? 0 : (GATE.takes ?? 2)));
  // Quota: NotebookLM không báo hết lượt (create vẫn OK, bản gen kẹt in_progress) → tự đếm
  // theo sổ input/_nlm-quota.json. Hết lượt → dừng sớm, gợi ý tài khoản khác (exit 4).
  const nlmProfile = currentProfile();
  for (let i = 0; i < want; i++) {
    const q = quotaStatus(nlmProfile);
    if (q.left <= 0 && !process.argv.includes("--ignore-quota")) {
      const reopen = q.reopensAt?.toLocaleString("vi-VN") ?? "?";
      log(`✗ ${nlmProfile} hết quota (${q.used}/${q.max} trong ${q.windowH}h) — mở lại ~${reopen}. ` +
        `Xem \`npx tsx podcast/scripts/nlm-quota.ts\`, chạy lại với NLM_PROFILE=<tài khoản còn lượt> (hoặc --ignore-quota).`);
      if (!st.artifacts.length) process.exit(4);
      break;
    }
    const before = new Set(audioArtifacts().map((a) => a.id));
    try {
      nlm(
        KIND === "video"
          ? ["video", "create", NB, "--format", "explainer", "--style", GATE.videoStyle ?? "auto_select", "--language", "vi", "--focus", focus, "--confirm"]
          : ["audio", "create", NB, "--language", "vi", "--format", "deep_dive", "--length", LENGTH, "--focus", focus, "--confirm"],
      );
    } catch (e) {
      log(`⚠ ${KIND} create báo lỗi (có thể hết quota): ${(e as Error).message.slice(0, 160)}`);
    }
    // nlm tự retry khi RESOURCE_EXHAUSTED và MỖI lần retry có thể đã tạo 1 artifact (bản ma —
    // memory nlm-audio-create-retry-ghost-artifacts) → đợi status ổn định, giữ 1, xoá phần thừa.
    await new Promise((r) => setTimeout(r, 15_000));
    const added = audioArtifacts().filter((a) => !before.has(a.id)).map((a) => a.id);
    if (!added.length) {
      log("Không tạo thêm được bản nào — dừng gen (quota?).");
      break;
    }
    const [keep, ...ghosts] = added;
    for (const g of ghosts) {
      try {
        nlm(["studio", "delete", NB, g, "--confirm"]);
      } catch (e) {
        log(`⚠ không xoá được bản ma ${g}: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    if (ghosts.length) log(`xoá ${ghosts.length} bản ma do nlm tự retry`);
    st.artifacts.push(keep);
    record({ profile: nlmProfile, kind: KIND, slug, artifact: keep });
    save();
    log(`đã yêu cầu bản ${st.artifacts.length} (${keep})`);
    // Giãn cách giữa các lần create để đỡ dính rate limit.
    if (i < want - 1) await new Promise((r) => setTimeout(r, 60_000));
  }

  // 4+5. Poll → tải từng bản khi xong. Status "unknown" (nlm bản cũ luôn vậy — memory
  // nlm-studio-status-unknown-poll-by-download) → thử tải luôn, tải được = xong.
  const tryDownload = (id: string): boolean => {
    if (st.takes[id]) return true;
    const n = Object.keys(st.takes).length + 1;
    const file = path.join(input, `${slug}.take${n}.m4a`);
    try {
      if (KIND === "video") {
        const mp4 = path.resolve("tmp", `${slug}.take${n}.video.mp4`);
        nlm(["download", "video", NB, "--id", id, "--output", mp4, "--no-progress"]);
        if (!fs.existsSync(mp4) || fs.statSync(mp4).size < 100_000) return false;
        // Chỉ lấy tiếng (AAC sẵn → copy, không mã hoá lại); hình của video không dùng.
        execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", mp4, "-vn", "-c:a", "copy", file]);
        fs.rmSync(mp4, { force: true });
      } else {
        nlm(["download", "audio", NB, "--id", id, "--output", file, "--no-progress"]);
      }
    } catch {
      return false;
    }
    if (!fs.existsSync(file) || fs.statSync(file).size < 100_000) return false;
    const cut = trimTrailingSilence(file);
    st.takes[id] = { file: path.basename(file), minutes: Math.round(durationMin(file) * 10) / 10 };
    save();
    log(`bản ${n}: ${st.takes[id].minutes}'${cut > 1 ? ` (cắt ${cut.toFixed(0)}s đuôi im lặng)` : ""}`);
    return true;
  };
  const deadline = Date.now() + POLL_MAX_MIN * 60_000;
  for (;;) {
    const mine = audioArtifacts().filter((a) => st.artifacts.includes(a.id));
    let pending = 0;
    for (const a of mine) {
      if (st.takes[a.id] || /failed|error/i.test(a.status)) continue;
      if (/completed/i.test(a.status) || /unknown/i.test(a.status)) {
        if (tryDownload(a.id)) continue;
      }
      pending++;
    }
    if (!pending) break;
    if (Date.now() > deadline) {
      // Kẹt ≥ POLL_MAX_MIN = dấu hiệu hết quota (không có lỗi nào báo) → khoá tài khoản tới khi mở lại.
      const until = markExhausted(nlmProfile);
      log(`⚠ ${pending} bản kẹt in_progress sau ${POLL_MAX_MIN}' — coi ${nlmProfile} HẾT QUOTA tới ~${until.toLocaleString("vi-VN")}.`);
      break;
    }
    log(`chờ ${pending}/${mine.length} bản đang gen…`);
    await new Promise((r) => setTimeout(r, POLL_SEC * 1000));
  }

  // 6. Chọn bản 14–18' gần 16' nhất
  const ok = Object.values(st.takes)
    .filter((t) => t.minutes >= MIN_MIN && t.minutes <= MAX_MIN)
    .sort((x, y) => Math.abs(x.minutes - TARGET_MIN) - Math.abs(y.minutes - TARGET_MIN));
  const result = { notebookId: NB, takes: Object.values(st.takes), chosen: ok[0] ?? null };
  if (ok[0]) {
    const dest = path.join(input, `${slug}.m4a`);
    if (fs.existsSync(dest) && !process.argv.includes("--force")) {
      log(`input/${slug}.m4a đã có — giữ nguyên (thêm --force để thay bằng ${ok[0].file})`);
    } else {
      fs.copyFileSync(path.join(input, ok[0].file), dest);
      log(`✓ chọn ${ok[0].file} (${ok[0].minutes}') → input/${slug}.m4a`);
    }
  } else {
    log(`✗ chưa có bản ${MIN_MIN}–${MAX_MIN}' — chạy lại với --takes=1 (hoặc --profile=<khác>).`);
  }
  console.log(JSON.stringify(result));
  process.exit(ok[0] ? 0 : 2);
}

main().catch((e) => {
  console.error("[nlm-batch] FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
