/**
 * Asset Research types — shape chuẩn hoá cho mọi provider.
 *
 * Mỗi provider (Wikimedia, Met, Rijksmuseum, Pexels...) trả về cùng
 * `AssetResult` này. UI hiển thị đồng nhất bất kể nguồn.
 *
 * Phase 26 PLAN — link-only manifest (không download): chỉ giữ URL +
 * metadata, render pipeline (Phase 22) tải vào shared/asset-cache/ khi cần.
 */

export type AssetKind = "image" | "video" | "audio";

/**
 * License classification cho ranking + warning UI:
 *   - safe    → render thoải mái (public domain / Pexels-like)
 *   - check   → user phải tick xác nhận trước khi render
 *   - blocked → KHÔNG render, chỉ giữ trong manifest cho audit
 */
export type LicenseStatus = "safe" | "check" | "blocked";

export type AssetResult = {
  /** "<provider>:<nativeId>" — primary key cross-provider. */
  id: string;
  provider: string;
  kind: AssetKind;
  title: string;
  author?: string;
  year?: string;
  /** Preview nhỏ (~200-400px) — hiện trong grid. */
  thumbUrl: string;
  /** Bản đầy đủ — render pipeline tải về. */
  fullUrl: string;
  /** Page gốc của asset — credit + audit. */
  sourcePage: string;
  /** License text gốc từ provider (vd "CC BY-SA 4.0", "Public Domain"). */
  license: string;
  licenseStatus: LicenseStatus;
  width?: number;
  height?: number;
  durationMs?: number;
};

/** Provider metadata — UI hiển thị + biết bật/tắt. */
export type ProviderInfo = {
  id: string;
  label: string;
  kinds: AssetKind[];
  /** True nếu cần API key trong `.env`. */
  needsKey: boolean;
  /** True nếu key đã có (hoặc không cần). False → ẩn / disable trong UI. */
  enabled: boolean;
  /** Ghi chú ngắn — vd "Open access — public domain art". */
  note?: string;
};

/** Args mọi search() function của provider. */
export type SearchArgs = {
  query: string;
  kind: AssetKind;
  page?: number;
  pageSize?: number;
  /** Abort signal — nếu user cancel hoặc timeout. */
  signal?: AbortSignal;
};

/** Return shape của search(). */
export type SearchResponse = {
  results: AssetResult[];
  hasNextPage: boolean;
  total?: number;
};

export interface AssetProvider {
  info: ProviderInfo;
  search(args: SearchArgs): Promise<SearchResponse>;
}
