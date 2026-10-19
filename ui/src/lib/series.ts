/**
 * Series/kênh — BẢN SAO GỌN của podcast/src/series.ts (UI không import được code
 * ngoài ui/). Thêm/sửa series thì sửa CẢ HAI file.
 */
export type SeriesId = "bytecast" | "chuyen-xua" | "dong-ho-viet" | "tien-tam-ly";

export const SERIES_OPTIONS: Array<{
  id: SeriesId;
  channelName: string;
  playlistsFile: string;
  /** Lớp màu nhận diện kênh trên UI (menu, lịch kế hoạch). */
  tone: string;
}> = [
  { id: "bytecast", channelName: "ByteCast Tech", playlistsFile: "_fb-playlists.json", tone: "bg-primary/15 text-primary" },
  {
    id: "chuyen-xua",
    channelName: "Chuyện Xưa - Ngẫm Nay",
    playlistsFile: "_fb-playlists.chuyen-xua.json",
    tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  {
    id: "dong-ho-viet",
    channelName: "Dòng Họ Việt",
    playlistsFile: "_fb-playlists.dong-ho-viet.json",
    tone: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
  {
    id: "tien-tam-ly",
    channelName: "Tiền & Tâm Lý",
    playlistsFile: "_fb-playlists.tien-tam-ly.json",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
];

export const seriesInfo = (id: string | null | undefined) =>
  SERIES_OPTIONS.find((s) => s.id === id) ?? SERIES_OPTIONS[0];

/** Trang danh sách tập của series (ByteCast giữ "/" như cũ). */
export const seriesListPath = (id: string | null | undefined) => {
  const sid = seriesInfo(id).id;
  return sid === "bytecast" ? "/" : `/series/${sid}`;
};
