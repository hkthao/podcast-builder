/**
 * Các series (kênh/Trang FB) dùng chung studio. Mỗi tập gắn `series` trong config
 * → nhận diện trong video (watermark, outro), công bố khi đăng, Trang FB, playlist
 * và đánh số tập ĐỀU tách theo series.
 *
 * File này KHÔNG import remotion → dùng được cả ở server lẫn composition.
 */
export const SERIES_IDS = ["bytecast", "chuyen-xua"] as const;
export type SeriesId = (typeof SERIES_IDS)[number];
export const DEFAULT_SERIES: SeriesId = "bytecast";

/** Bảng màu khung video (khớp key COLORS trong theme.ts). */
export type SeriesPalette = {
  bg: string;
  bgAlt: string;
  ink: string;
  inkMuted: string;
  white: string;
  accentRed: string;
  accentBlue: string;
  accentTeal: string;
  gridLine: string;
};

export type SeriesInfo = {
  id: SeriesId;
  /** Màu khung (intro, hook, outro, nền, watermark, caption…). null = palette ByteCast mặc định. */
  palette: SeriesPalette | null;
  channelName: string;
  slogan: string;
  /** Mô tả kênh — metadata / mô tả Facebook. Không hiển thị trong video. */
  description: string;
  cta: string;
  /** Logo lockup đầy đủ (trong public/) cho Outro. null = chưa có → outro hiện tên kênh bằng chữ. */
  logoFile: string | null;
  /** Logo nhỏ cho Watermark. null = chưa có → watermark hiện tên kênh bằng chữ. */
  markFile: string | null;
  /** Phóng logo watermark để cắt hoạ tiết thừa quanh logo (ByteCast 1.3; con dấu sát viền = 1). */
  markZoom: number;
  /** Biến môi trường chứa ID Trang FB của series (token Settings phải quản Trang này). */
  fbPageIdEnv: string;
  /** File playlist chuẩn của Trang, trong input/. */
  playlistsFile: string;
};

export const SERIES: Record<SeriesId, SeriesInfo> = {
  bytecast: {
    id: "bytecast",
    palette: null,
    channelName: "ByteCast Tech",
    slogan: "Giữa Công Nghệ Và Bản Chất Con Người",
    description:
      "ByteCast Tech khám phá những câu hỏi lớn của thời đại AI, nơi công nghệ giao thoa với triết học, tâm lý học và xã hội học để giúp chúng ta hiểu rõ hơn về con người, ý nghĩa và tương lai.",
    cta: "Theo dõi để xem thêm",
    logoFile: "brand/logo.png",
    markFile: "brand/logo-bytecast.png",
    markZoom: 1.3,
    fbPageIdEnv: "FB_PAGE_ID",
    playlistsFile: "_fb-playlists.json",
  },
  "chuyen-xua": {
    id: "chuyen-xua",
    // Giấy dó + mực nâu + đỏ son / xanh chàm / xanh rêu — tông sách cổ.
    palette: {
      bg: "#F1E6CC",
      bgAlt: "#E6D6B4",
      ink: "#2E2117",
      inkMuted: "#6E5D4B",
      white: "#FFFBF0",
      accentRed: "#B03A2E",
      accentBlue: "#35586B",
      accentTeal: "#6B8A5A",
      gridLine: "rgba(46, 33, 23, 0.07)",
    },
    channelName: "Chuyện Xưa - Ngẫm Nay",
    slogan: "Truyện người xưa, bài học hôm nay",
    description:
      "Chuyện Xưa - Ngẫm Nay kể lại những câu chuyện trong sách cổ như Cổ học tinh hoa, rồi cùng ngẫm xem người xưa còn dạy gì cho cuộc sống hôm nay.",
    cta: "Theo dõi để nghe chuyện tiếp",
    // Con dấu đỏ son cắt sát viền từ ảnh đại diện Trang FB (fb-avatar.jpg).
    logoFile: "brand/chuyen-xua/mark.png",
    markFile: "brand/chuyen-xua/mark.png",
    markZoom: 1,
    fbPageIdEnv: "FB_PAGE_ID_CHUYEN_XUA",
    playlistsFile: "_fb-playlists.chuyen-xua.json",
  },
};

/** Tên kênh chia dòng ở " - " ("Chuyện Xưa - Ngẫm Nay" → 2 dòng) cho logo dạng chữ. */
export const channelNameLines = (s: SeriesInfo): string[] => s.channelName.split(/\s+-\s+/);

export const getSeries = (id: string | null | undefined): SeriesInfo =>
  SERIES[(SERIES_IDS as readonly string[]).includes(id ?? "") ? (id as SeriesId) : DEFAULT_SERIES];
