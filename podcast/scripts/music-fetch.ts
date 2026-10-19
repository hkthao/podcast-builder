/**
 * Tải kho nhạc nền an toàn Content ID (podcast/data/music-library.json) từ Wikimedia Commons.
 *
 *   npx tsx podcast/scripts/music-fetch.ts            # tải bài còn thiếu
 *   npx tsx podcast/scripts/music-fetch.ts --force    # tải + xử lý lại tất cả
 *
 * Mỗi bài:
 *  1. Hỏi API Commons → license hiện tại PHẢI thuộc allowedLicenses (CC0/PD) — trang file
 *     bị đổi license thì bỏ qua, không tải.
 *  2. Tải bản gốc → ffmpeg: cắt lặng đầu/cuối, chuẩn hoá loudness −20 LUFS (để bgmVolumeDb
 *     cho cảm giác như nhau giữa các bài), xuất input/_music/lib/<id>.ogg (Vorbis q4).
 *  3. Đo LRA (độ chênh to/nhỏ): > MAX_LRA → đánh dấu "quá động" (đoạn cao trào sẽ lấn
 *     giọng đọc) → server KHÔNG bốc bài này.
 * Kết quả QC ghi input/_music/lib/_qc.json (server đọc để lọc).
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const LIB_JSON = path.join(ROOT, "podcast/data/music-library.json");
const OUT_DIR = path.join(ROOT, "input/_music/lib");
const QC_JSON = path.join(OUT_DIR, "_qc.json");
const UA = "podcast-builder/1.0 (local music library fetch)";
const TARGET_LUFS = -20;
const MAX_LRA = 16;

type Track = { id: string; commonsTitle: string; composer: string; work: string; license: string };
export type TrackQc = {
  ok: boolean;
  reason?: string;
  license: string;
  sourceUrl: string;
  durationSec: number;
  lra: number;
  checkedAt: string;
};

const force = process.argv.includes("--force");
const lib = JSON.parse(fs.readFileSync(LIB_JSON, "utf8")) as { allowedLicenses: string[]; tracks: Track[] };
fs.mkdirSync(OUT_DIR, { recursive: true });
const qc: Record<string, TrackQc> = fs.existsSync(QC_JSON) ? JSON.parse(fs.readFileSync(QC_JSON, "utf8")) : {};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Commons giới hạn tần suất (429 / trang "You are making too many requests") → chờ tăng dần rồi thử lại. */
async function fetchRetry(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    const limited = res.status === 429 || (res.headers.get("content-type")?.includes("text/plain") && url.includes("api.php"));
    if (!limited || attempt >= 6) return res;
    const wait = Number(res.headers.get("retry-after")) * 1000 || 15_000 * attempt;
    process.stdout.write(`(bị giới hạn, chờ ${Math.round(wait / 1000)}s) `);
    await sleep(wait);
  }
}

async function commonsInfo(title: string): Promise<{ url: string; license: string; page: string }> {
  const qs = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    format: "json",
  });
  const res = await fetchRetry(`https://commons.wikimedia.org/w/api.php?${qs}`);
  const d = (await res.json()) as any;
  const page = Object.values(d?.query?.pages ?? {})[0] as any;
  const ii = page?.imageinfo?.[0];
  if (!ii?.url) throw new Error("không tìm thấy file trên Commons");
  return {
    url: ii.url,
    license: ii.extmetadata?.LicenseShortName?.value ?? "?",
    page: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

function ffprobeDuration(file: string): number {
  return Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim(),
  );
}

/** LRA (Loudness Range, LU) qua ebur128 — cao = nhiều đoạn to/nhỏ chênh lệch. */
function measureLra(file: string): number {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  // Dòng LRA cuối cùng = phần Summary.
  const all = [...String(r.stderr).matchAll(/LRA:\s+([\d.]+) LU/g)];
  return all.length ? Number(all[all.length - 1][1]) : NaN;
}

async function main() {
  let done = 0;
  let skipped = 0;
  for (const t of lib.tracks) {
    const out = path.join(OUT_DIR, `${t.id}.ogg`);
    if (!force && fs.existsSync(out) && qc[t.id]) {
      skipped++;
      continue;
    }
    process.stdout.write(`• ${t.id} … `);
    try {
      const info = await commonsInfo(t.commonsTitle);
      if (!lib.allowedLicenses.includes(info.license)) {
        qc[t.id] = { ok: false, reason: `license trên Commons giờ là "${info.license}"`, license: info.license, sourceUrl: info.page, durationSec: 0, lra: 0, checkedAt: new Date().toISOString() };
        console.log(`✗ license ${info.license} — bỏ qua`);
        continue;
      }
      const ext = path.extname(new URL(info.url).pathname) || ".bin";
      const raw = path.join(OUT_DIR, `_raw-${t.id}${ext}`);
      const res = await fetchRetry(info.url);
      if (!res.ok) throw new Error(`tải lỗi HTTP ${res.status}`);
      fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
      // Cắt lặng đầu (+ cuối qua areverse), chuẩn hoá loudness, stereo 44.1k Vorbis.
      execFileSync(
        "ffmpeg",
        [
          "-v", "error", "-y", "-i", raw,
          "-af",
          [
            "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.3",
            "areverse",
            "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=1.5",
            "areverse",
            `loudnorm=I=${TARGET_LUFS}:TP=-2:LRA=11`,
          ].join(","),
          "-ar", "44100", "-ac", "2", "-c:a", "libvorbis", "-q:a", "4", out,
        ],
        { stdio: ["ignore", "ignore", "inherit"] },
      );
      fs.unlinkSync(raw);
      const durationSec = Math.round(ffprobeDuration(out));
      const lra = measureLra(out);
      const ok = !(lra > MAX_LRA) && durationSec >= 60;
      qc[t.id] = {
        ok,
        ...(ok ? {} : { reason: durationSec < 60 ? "quá ngắn (<60s)" : `quá động (LRA ${lra} LU > ${MAX_LRA})` }),
        license: info.license,
        sourceUrl: info.page,
        durationSec,
        lra,
        checkedAt: new Date().toISOString(),
      };
      done++;
      await sleep(3000); // lịch sự với Commons
      console.log(`${ok ? "✓" : "⚠"} ${durationSec}s, LRA ${lra} LU, ${info.license}${ok ? "" : ` — ${qc[t.id].reason}`}`);
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message : e}`);
    }
    fs.writeFileSync(QC_JSON, JSON.stringify(qc, null, 1));
  }
  fs.writeFileSync(QC_JSON, JSON.stringify(qc, null, 1));
  const okCount = lib.tracks.filter((t) => qc[t.id]?.ok && fs.existsSync(path.join(OUT_DIR, `${t.id}.ogg`))).length;
  console.log(`\nXong: tải ${done}, bỏ qua (đã có) ${skipped}. Dùng được ${okCount}/${lib.tracks.length} bài.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
