/**
 * Series/kênh — BẢN SAO GỌN của podcast/src/series.ts (UI không import được code
 * ngoài ui/). Thêm/sửa series thì sửa CẢ HAI file.
 */
export type SeriesId = "bytecast" | "chuyen-xua";

export const SERIES_OPTIONS: Array<{ id: SeriesId; channelName: string; playlistsFile: string }> = [
  { id: "bytecast", channelName: "ByteCast Tech", playlistsFile: "_fb-playlists.json" },
  { id: "chuyen-xua", channelName: "Chuyện Xưa - Ngẫm Nay", playlistsFile: "_fb-playlists.chuyen-xua.json" },
];

export const seriesInfo = (id: string | null | undefined) =>
  SERIES_OPTIONS.find((s) => s.id === id) ?? SERIES_OPTIONS[0];

/** Trang danh sách tập của series (ByteCast giữ "/" như cũ). */
export const seriesListPath = (id: string | null | undefined) => {
  const sid = seriesInfo(id).id;
  return sid === "bytecast" ? "/" : `/series/${sid}`;
};
