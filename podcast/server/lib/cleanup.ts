/**
 * Dọn ổ cứng (ổ máy user hay đầy → render ENOSPC). Chỉ xoá thứ TẠO LẠI ĐƯỢC hoặc
 * thuộc tập ĐÃ ĐĂNG đủ lâu. KHÔNG bao giờ đụng footage tự quay (input/footage/*.mp4
 * ngoài pexels*), audio master đang dùng, config/kịch bản.
 *
 * Mục nặng/khó tạo lại (footage Pexels, video output) mặc định KHÔNG chọn.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PATHS } from "../../../shared/studio-core/paths";
import { listJobs } from "./render-runner";

export type CleanupCategory = {
  id: string;
  label: string;
  description: string;
  bytes: number;
  count: number;
  /** Chọn sẵn trên UI (an toàn tuyệt đối, tạo lại tự động). */
  defaultSelected: boolean;
  /** Không xoá được lúc này (vd đang render) — lý do. */
  blockedReason: string | null;
};

/** Tập đăng xong ≥ N ngày mới xoá footage/video của nó. */
const PUBLISHED_MIN_DAYS = 3;
/**
 * User thường ĐĂNG TAY (publishStatus vẫn "draft") → coi tập render xong ≥ N ngày là
 * "cũ" luôn, trừ tập đang hẹn giờ / còn nằm trong lịch kế hoạch sắp tới.
 */
const RENDERED_MIN_DAYS = 14;

/** "Tập cũ" = đã đăng ≥3 ngày HOẶC render xong ≥14 ngày; trừ tập đang hẹn giờ / còn trong lịch. */
export const OLD_EPISODE_RULE = `đã đăng ≥${PUBLISHED_MIN_DAYS} ngày hoặc render xong ≥${RENDERED_MIN_DAYS} ngày; trừ tập đang hẹn giờ / còn trong lịch`;

const INPUT = PATHS.INPUT_DIR;
const TMP = PATHS.TMP_DIR;
const OUTPUT = PATHS.OUTPUT_DIR;
const FOOTAGE = path.join(INPUT, "footage");

const sizeOf = (p: string): number => {
  try {
    const st = fs.statSync(p);
    if (!st.isDirectory()) return st.size;
    return fs.readdirSync(p).reduce((n, f) => n + sizeOf(path.join(p, f)), 0);
  } catch {
    return 0;
  }
};
const ls = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

type EpisodeLite = {
  name: string;
  publishedDaysAgo: number | null;
  renderedDaysAgo: number | null;
  scheduled: boolean;
  footage: string[];
  footageLandscape: string[];
};

const readEpisodes = (): EpisodeLite[] =>
  ls(INPUT)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_") && !/\.(story|editorial)\.json$/.test(f))
    .flatMap((f) => {
      try {
        const c = JSON.parse(fs.readFileSync(path.join(INPUT, f), "utf-8"));
        if (typeof c !== "object" || !c || !("episodeNumber" in c)) return [];
        const when = c.publishStatus === "published" ? Date.parse(c.publishedAt ?? "") : NaN;
        const out = path.join(OUTPUT, f.replace(/\.json$/, ".mp4"));
        // Mốc "làm xong": video xuất; video đã bị xoá thì lấy ngày tải footage đầu tiên.
        const firstClip = Array.isArray(c.footage) && c.footage[0] ? path.join(FOOTAGE, c.footage[0]) : "";
        const rendered = fs.existsSync(out)
          ? fs.statSync(out).mtimeMs
          : firstClip && fs.existsSync(firstClip)
            ? fs.statSync(firstClip).mtimeMs
            : NaN;
        return [
          {
            name: f.replace(/\.json$/, ""),
            publishedDaysAgo: Number.isNaN(when) ? null : (Date.now() - when) / 86_400_000,
            renderedDaysAgo: Number.isNaN(rendered) ? null : (Date.now() - rendered) / 86_400_000,
            scheduled: c.publishStatus === "scheduled",
            footage: Array.isArray(c.footage) ? c.footage : [],
            footageLandscape: Array.isArray(c.footageLandscape) ? c.footageLandscape : [],
          },
        ];
      } catch {
        return [];
      }
    });

/** Danh sách file/thư mục từng mục — dùng chung cho scan + xoá. */
function collect(): Record<string, string[]> {
  const eps = readEpisodes();
  // Tập còn trong lịch kế hoạch từ hôm nay trở đi → giữ nguyên.
  const today = new Date().toISOString().slice(0, 10);
  let planned = new Set<string>();
  try {
    const plan = JSON.parse(fs.readFileSync(path.join(INPUT, "_plan.json"), "utf-8")) as {
      slots?: Array<{ date: string; episode: string | null }>;
    };
    planned = new Set((plan.slots ?? []).filter((s) => s.episode && s.date >= today).map((s) => s.episode!));
  } catch {
    /* chưa có plan */
  }
  const oldPublished = eps.filter(
    (e) =>
      !e.scheduled &&
      !planned.has(e.name) &&
      ((e.publishedDaysAgo !== null && e.publishedDaysAgo >= PUBLISHED_MIN_DAYS) ||
        (e.renderedDaysAgo !== null && e.renderedDaysAgo >= RENDERED_MIN_DAYS)),
  );
  const tmpDir = os.tmpdir();
  return {
    "remotion-temp": ls(tmpDir)
      .filter((f) => f.startsWith("remotion-"))
      .map((f) => path.join(tmpDir, f)),
    "normalized-audio": ls(TMP)
      .filter((f) => /\.normalized(\.16k)*\.(16k|48k)\.wav$/.test(f) || /\.16k\.wav$/.test(f))
      .map((f) => path.join(TMP, f)),
    "render-leftovers": [
      ...ls(TMP).filter((f) => /(fchunks|footagebg)/.test(f) || /^qc-.*\.mp3$/.test(f)),
      ...ls(TMP).filter((f) => f.endsWith(".tts")),
    ].map((f) => path.join(TMP, f)),
    previews: ls(OUTPUT)
      .filter((f) => f.endsWith(".preview.mp4"))
      .map((f) => path.join(OUTPUT, f)),
    "voice-trials": ls(INPUT)
      .filter((f) => /\.parts-[^/]+$/.test(f))
      .map((f) => path.join(INPUT, f)),
    "old-takes": oldPublished.flatMap((e) =>
      ls(INPUT)
        .filter((f) => f.startsWith(`${e.name}.`) && /\.(v\d+|re)\.(m4a|mp3|wav|aac)$/.test(f))
        .map((f) => path.join(INPUT, f)),
    ),
    "published-footage": oldPublished.flatMap((e) =>
      [...e.footage, ...e.footageLandscape]
        .filter((f) => /^pexels(-yt)?\//.test(f))
        .map((f) => path.join(FOOTAGE, f))
        .filter((p) => fs.existsSync(p)),
    ),
    "published-videos": oldPublished.flatMap((e) =>
      [`${e.name}.mp4`, `${e.name}.yt.mp4`].map((f) => path.join(OUTPUT, f)).filter((p) => fs.existsSync(p)),
    ),
  };
}

const META: Record<string, { label: string; description: string; defaultSelected: boolean; needsIdle: boolean }> = {
  "remotion-temp": {
    label: "Bundle tạm Remotion",
    description: "Thư mục remotion-* trong thư mục tạm hệ thống — mỗi lần render tạo lại. Chỉ xoá khi không có job đang chạy.",
    defaultSelected: true,
    needsIdle: true,
  },
  "normalized-audio": {
    label: "Audio đã chuẩn hoá (WAV)",
    description: "tmp/*.normalized.*.wav — render lần sau tự tạo lại (khoảng 1 phút/tập).",
    defaultSelected: true,
    needsIdle: true,
  },
  "render-leftovers": {
    label: "Rác render dở / cache TTS",
    description: "Đoạn footage tạm (fchunks/footagebg) của render bị huỷ, file QC audio, cache tts.",
    defaultSelected: true,
    needsIdle: true,
  },
  previews: {
    label: "Video preview 10 giây",
    description: "output/*.preview.mp4.",
    defaultSelected: true,
    needsIdle: false,
  },
  "voice-trials": {
    label: "Audio thử giọng",
    description: "input/<slug>.parts-<giọng>/ — bản gen thử giọng khác để so sánh, không dùng trong video.",
    defaultSelected: true,
    needsIdle: false,
  },
  "old-takes": {
    label: `Bản audio A/B cũ của tập cũ`,
    description: "input/<slug>.v1/.v2/.re.m4a — các bản gen không chọn của tập đã đăng.",
    defaultSelected: true,
    needsIdle: false,
  },
  "published-footage": {
    label: `Footage Pexels của tập cũ`,
    description: "NẶNG nhất. Render lại tập đó cần chạy lại footage-plan --apply (tải lại). Footage tự quay KHÔNG bị xoá.",
    defaultSelected: false,
    needsIdle: true,
  },
  "published-videos": {
    label: `Video xuất của tập cũ`,
    description: "output/<slug>.mp4 / .yt.mp4 — đã nằm trên Facebook. Cần bản gốc (vd đăng YouTube) thì đừng chọn.",
    defaultSelected: false,
    needsIdle: false,
  },
};

const renderBusy = () => listJobs().some((j) => !["done", "error", "cancelled"].includes(j.status));

export function diskUsage(): { freeBytes: number; totalBytes: number } {
  const st = fs.statfsSync(INPUT);
  return { freeBytes: st.bavail * st.bsize, totalBytes: st.blocks * st.bsize };
}

export function scanCleanup(): {
  categories: CleanupCategory[];
  disk: ReturnType<typeof diskUsage>;
  oldEpisodeRule: string;
} {
  const files = collect();
  const busy = renderBusy();
  return {
    disk: diskUsage(),
    oldEpisodeRule: OLD_EPISODE_RULE,
    categories: Object.entries(META).map(([id, m]) => ({
      id,
      label: m.label,
      description: m.description,
      defaultSelected: m.defaultSelected,
      count: files[id]?.length ?? 0,
      bytes: (files[id] ?? []).reduce((n, p) => n + sizeOf(p), 0),
      blockedReason: m.needsIdle && busy ? "Đang có job render — đợi xong rồi dọn." : null,
    })),
  };
}

export function runCleanup(ids: string[]): { freedBytes: number; deleted: number; skipped: string[] } {
  const files = collect();
  const busy = renderBusy();
  let freed = 0;
  let deleted = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const m = META[id];
    if (!m) continue;
    if (m.needsIdle && busy) {
      skipped.push(id);
      continue;
    }
    for (const p of files[id] ?? []) {
      const n = sizeOf(p);
      try {
        fs.rmSync(p, { recursive: true, force: true });
        freed += n;
        deleted++;
      } catch {
        /* file đang bị giữ → bỏ qua */
      }
    }
  }
  return { freedBytes: freed, deleted, skipped };
}
