/**
 * Gallery asset library store — Phase 26a stage 3.
 *
 * Cross-episode asset library: 1 ảnh tranh có thể được dùng trong nhiều
 * episodes (vd Giotto's Lamentation xuất hiện ở episode về Giotto + episode
 * về Padua + episode về Phục Hưng). Store theo URL hash (primary key
 * "<provider>:<nativeId>") để dedupe.
 *
 * Link-only: KHÔNG lưu file local trong store. Chỉ metadata + URLs. Render
 * pipeline (Phase 22) tải vào shared/asset-cache/ khi cần.
 */
import { getDb } from "./db";
import type { AssetKind, AssetResult, LicenseStatus } from "./asset-sources/types";

export type SavedAsset = AssetResult & {
  tags: string[];
  savedAt: string;
  pinned: boolean;
  usedInEpisodes: string[];
};

type DbRow = {
  id: string;
  provider: string;
  kind: string;
  title: string;
  author: string | null;
  year: string | null;
  thumb_url: string;
  full_url: string;
  source_page: string;
  license: string;
  license_status: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  tags_json: string;
  saved_at: string;
  pinned: number;
  used_in_episodes_json: string;
};

const rowToAsset = (r: DbRow): SavedAsset => ({
  id: r.id,
  provider: r.provider,
  kind: r.kind as AssetKind,
  title: r.title,
  author: r.author ?? undefined,
  year: r.year ?? undefined,
  thumbUrl: r.thumb_url,
  fullUrl: r.full_url,
  sourcePage: r.source_page,
  license: r.license,
  licenseStatus: r.license_status as LicenseStatus,
  width: r.width ?? undefined,
  height: r.height ?? undefined,
  durationMs: r.duration_ms ?? undefined,
  tags: JSON.parse(r.tags_json) as string[],
  savedAt: r.saved_at,
  pinned: r.pinned === 1,
  usedInEpisodes: JSON.parse(r.used_in_episodes_json) as string[],
});

export function saveAsset(input: AssetResult, tags: string[] = []): SavedAsset {
  const now = new Date().toISOString();
  const db = getDb();
  // Idempotent: nếu đã tồn tại, GIỮ saved_at + tags + pinned + usedInEpisodes
  // (chỉ refresh metadata phòng hờ provider cập nhật).
  const existing = db
    .prepare("SELECT * FROM gallery_assets WHERE id = ?")
    .get(input.id) as DbRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE gallery_assets SET
         title = ?, author = ?, year = ?, thumb_url = ?, full_url = ?,
         source_page = ?, license = ?, license_status = ?,
         width = ?, height = ?, duration_ms = ?
       WHERE id = ?`,
    ).run(
      input.title,
      input.author ?? null,
      input.year ?? null,
      input.thumbUrl,
      input.fullUrl,
      input.sourcePage,
      input.license,
      input.licenseStatus,
      input.width ?? null,
      input.height ?? null,
      input.durationMs ?? null,
      input.id,
    );
    return rowToAsset({
      ...existing,
      title: input.title,
      author: input.author ?? null,
      year: input.year ?? null,
      thumb_url: input.thumbUrl,
      full_url: input.fullUrl,
      source_page: input.sourcePage,
      license: input.license,
      license_status: input.licenseStatus,
      width: input.width ?? null,
      height: input.height ?? null,
      duration_ms: input.durationMs ?? null,
    });
  }

  db.prepare(
    `INSERT INTO gallery_assets
       (id, provider, kind, title, author, year, thumb_url, full_url,
        source_page, license, license_status, width, height, duration_ms,
        tags_json, saved_at, pinned, used_in_episodes_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.provider,
    input.kind,
    input.title,
    input.author ?? null,
    input.year ?? null,
    input.thumbUrl,
    input.fullUrl,
    input.sourcePage,
    input.license,
    input.licenseStatus,
    input.width ?? null,
    input.height ?? null,
    input.durationMs ?? null,
    JSON.stringify(tags),
    now,
    0,
    JSON.stringify([]),
  );

  const row = db
    .prepare("SELECT * FROM gallery_assets WHERE id = ?")
    .get(input.id) as DbRow;
  return rowToAsset(row);
}

export type LibraryFilters = {
  q?: string;
  kind?: AssetKind;
  provider?: string;
  licenseStatus?: LicenseStatus;
  tag?: string;
  pinned?: boolean;
};

export function listAssets(filters: LibraryFilters = {}): SavedAsset[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.q) {
    where.push("(title LIKE ? OR author LIKE ?)");
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }
  if (filters.kind) {
    where.push("kind = ?");
    params.push(filters.kind);
  }
  if (filters.provider) {
    where.push("provider = ?");
    params.push(filters.provider);
  }
  if (filters.licenseStatus) {
    where.push("license_status = ?");
    params.push(filters.licenseStatus);
  }
  if (filters.pinned !== undefined) {
    where.push("pinned = ?");
    params.push(filters.pinned ? 1 : 0);
  }
  const sql =
    "SELECT * FROM gallery_assets" +
    (where.length > 0 ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY pinned DESC, saved_at DESC";
  const rows = getDb().prepare(sql).all(...params) as DbRow[];
  let assets = rows.map(rowToAsset);
  if (filters.tag) {
    assets = assets.filter((a) => a.tags.includes(filters.tag!));
  }
  return assets;
}

export function getAsset(id: string): SavedAsset | null {
  const row = getDb()
    .prepare("SELECT * FROM gallery_assets WHERE id = ?")
    .get(id) as DbRow | undefined;
  return row ? rowToAsset(row) : null;
}

export function deleteAsset(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM gallery_assets WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

export function setTags(id: string, tags: string[]): SavedAsset | null {
  const result = getDb()
    .prepare("UPDATE gallery_assets SET tags_json = ? WHERE id = ?")
    .run(JSON.stringify(tags), id);
  if (result.changes === 0) return null;
  return getAsset(id);
}

export function togglePin(id: string): SavedAsset | null {
  const current = getAsset(id);
  if (!current) return null;
  getDb()
    .prepare("UPDATE gallery_assets SET pinned = ? WHERE id = ?")
    .run(current.pinned ? 0 : 1, id);
  return getAsset(id);
}

export function linkToEpisode(id: string, episodeName: string): SavedAsset | null {
  const current = getAsset(id);
  if (!current) return null;
  if (current.usedInEpisodes.includes(episodeName)) return current;
  const next = [...current.usedInEpisodes, episodeName];
  getDb()
    .prepare("UPDATE gallery_assets SET used_in_episodes_json = ? WHERE id = ?")
    .run(JSON.stringify(next), id);
  return getAsset(id);
}

export function unlinkFromEpisode(
  id: string,
  episodeName: string,
): SavedAsset | null {
  const current = getAsset(id);
  if (!current) return null;
  const next = current.usedInEpisodes.filter((e) => e !== episodeName);
  if (next.length === current.usedInEpisodes.length) return current;
  getDb()
    .prepare("UPDATE gallery_assets SET used_in_episodes_json = ? WHERE id = ?")
    .run(JSON.stringify(next), id);
  return getAsset(id);
}
