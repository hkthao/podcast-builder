/**
 * Kho nhạc nền xoay vòng — tránh 1 bài dính Content ID kéo cả loạt tập.
 *
 * Nguồn: podcast/data/music-library.json (Musopen CC0/PD, tải bằng scripts/music-fetch.ts
 * vào input/_music/lib/<id>.ogg; QC ở _qc.json). Tập mới bốc NGẪU NHIÊN trong các bài
 * hợp series, ưu tiên:
 *   1. bài KHÔNG đang nằm trong tập chưa đăng nào (tuần này mỗi tập 1 bài khác nhau),
 *   2. bài lâu chưa dùng nhất (sổ _usage.json),
 * rồi random trong nhóm tốt nhất → không lặp, khó đoán, 1 claim chỉ dính 1 tập.
 * Bài bị claim → chặn (input/_music-blocklist.json) → không bao giờ bốc lại.
 */
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../../shared/studio-core/paths";

const ROOT = process.cwd();
const LIB_JSON = path.join(ROOT, "podcast/data/music-library.json");
const LIB_DIR = path.join(PATHS.INPUT_DIR, "_music/lib");
const QC_JSON = path.join(LIB_DIR, "_qc.json");
const USAGE_JSON = path.join(LIB_DIR, "_usage.json");
const BLOCK_JSON = path.join(PATHS.INPUT_DIR, "_music-blocklist.json");

type LibTrack = {
  id: string;
  commonsTitle: string;
  composer: string;
  work: string;
  performer: string;
  license: string;
  series: string[];
  mood: string;
};
type Qc = { ok: boolean; reason?: string; sourceUrl: string; durationSec: number; lra: number };
type Usage = Record<string, { episode: string; at: string }[]>;
type Blocklist = Record<string, { reason: string; at: string }>;

export type MusicTrack = LibTrack & {
  /** Đường dẫn tương đối input/ — ghi vào config.bgm. */
  bgm: string;
  credit: string;
  downloaded: boolean;
  qc: Qc | null;
  blocked: { reason: string; at: string } | null;
  usable: boolean;
  useCount: number;
  lastUsedAt: string | null;
  /** Tập CHƯA đăng đang dùng bài này. */
  upcoming: string[];
};

const readJson = <T>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
};

const licenseLabel = (l: string) => (l === "CC0" ? "CC0" : "Public Domain");

export const musicCredit = (t: LibTrack): string =>
  `Nhạc: ${t.composer} — ${t.work} (${t.performer}; ${licenseLabel(t.license)}, Wikimedia Commons)`;

/** Tập chưa đăng (draft/ready/scheduled) → bài nhạc đang giữ. */
function upcomingByTrack(): Map<string, string[]> {
  const m = new Map<string, string[]>();
  let files: string[] = [];
  try {
    files = fs.readdirSync(PATHS.INPUT_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  } catch {
    return m;
  }
  for (const f of files) {
    const c = readJson<{ bgm?: string | null; publishStatus?: string }>(path.join(PATHS.INPUT_DIR, f), {});
    const id = c.bgm?.match(/^_music\/lib\/(.+)\.ogg$/)?.[1];
    if (!id || c.publishStatus === "published") continue;
    m.set(id, [...(m.get(id) ?? []), f.replace(/\.json$/, "")]);
  }
  return m;
}

export function listMusicLibrary(): MusicTrack[] {
  const lib = readJson<{ tracks: LibTrack[] }>(LIB_JSON, { tracks: [] }).tracks;
  const qc = readJson<Record<string, Qc>>(QC_JSON, {});
  const usage = readJson<Usage>(USAGE_JSON, {});
  const blocks = readJson<Blocklist>(BLOCK_JSON, {});
  const upcoming = upcomingByTrack();
  return lib.map((t) => {
    const downloaded = fs.existsSync(path.join(LIB_DIR, `${t.id}.ogg`));
    const uses = usage[t.id] ?? [];
    const blocked = blocks[t.id] ?? null;
    return {
      ...t,
      bgm: `_music/lib/${t.id}.ogg`,
      credit: musicCredit(t),
      downloaded,
      qc: qc[t.id] ?? null,
      blocked,
      usable: downloaded && !!qc[t.id]?.ok && !blocked,
      useCount: uses.length,
      lastUsedAt: uses.length ? uses[uses.length - 1].at : null,
      upcoming: upcoming.get(t.id) ?? [],
    };
  });
}

/**
 * Bốc 1 bài cho tập `episode` thuộc `series`. Null khi kho trống (chưa chạy music-fetch)
 * → caller dùng nhạc mặc định cũ. `exclude` = bài hiện tại (khi đổi bài).
 */
export function pickMusicTrack(series: string, episode: string, exclude?: string | null): MusicTrack | null {
  const pool = listMusicLibrary().filter((t) => t.usable && t.series.includes(series) && t.id !== exclude);
  if (!pool.length) return null;
  // Nhóm tốt nhất: ít tập-chưa-đăng đang dùng nhất, rồi nửa lâu-chưa-dùng nhất.
  const minUpcoming = Math.min(...pool.map((t) => t.upcoming.filter((e) => e !== episode).length));
  const fresh = pool
    .filter((t) => t.upcoming.filter((e) => e !== episode).length === minUpcoming)
    .sort((a, b) => (a.lastUsedAt ?? "").localeCompare(b.lastUsedAt ?? ""));
  const best = fresh.slice(0, Math.max(1, Math.ceil(fresh.length / 2)));
  const track = best[Math.floor(Math.random() * best.length)];

  const usage = readJson<Usage>(USAGE_JSON, {});
  usage[track.id] = [...(usage[track.id] ?? []), { episode, at: new Date().toISOString() }];
  fs.mkdirSync(LIB_DIR, { recursive: true });
  fs.writeFileSync(USAGE_JSON, JSON.stringify(usage, null, 1));
  return track;
}

/** Chặn bài (dính Content ID / nghe không hợp) — không bốc lại nữa. */
export function blockMusicTrack(id: string, reason: string): MusicTrack[] {
  const blocks = readJson<Blocklist>(BLOCK_JSON, {});
  blocks[id] = { reason: reason || "Content ID", at: new Date().toISOString() };
  fs.writeFileSync(BLOCK_JSON, JSON.stringify(blocks, null, 2));
  return listMusicLibrary();
}

export function unblockMusicTrack(id: string): MusicTrack[] {
  const blocks = readJson<Blocklist>(BLOCK_JSON, {});
  delete blocks[id];
  fs.writeFileSync(BLOCK_JSON, JSON.stringify(blocks, null, 2));
  return listMusicLibrary();
}

/** Bài trong kho ứng với config.bgm (null nếu nhạc tự tải lên / nhạc cũ). */
export const trackOfBgm = (bgm: string | null | undefined): MusicTrack | null => {
  const id = bgm?.match(/^_music\/lib\/(.+)\.ogg$/)?.[1];
  return id ? listMusicLibrary().find((t) => t.id === id) ?? null : null;
};
