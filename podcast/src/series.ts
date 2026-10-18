/**
 * Các series (kênh/Trang FB) dùng chung studio. Mỗi tập gắn `series` trong config
 * → nhận diện trong video (watermark, outro), công bố khi đăng, Trang FB, playlist
 * và đánh số tập ĐỀU tách theo series.
 *
 * File này KHÔNG import remotion → dùng được cả ở server lẫn composition.
 */
export const SERIES_IDS = ["bytecast", "chuyen-xua", "dong-ho-viet"] as const;
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

/**
 * Giọng Gemini TTS mặc định của series kể chuyện (story-tts-gemini / story-align).
 * story.json có thể ghi đè từng trường cho 1 tập.
 */
export type SeriesTts = {
  voice: string;
  /** Director's note gửi kèm transcript (Style/Pace/Accent…). */
  note: string;
  /** Tăng tốc khi ghép (atempo). Gemini bỏ qua chỉ đạo "đọc nhanh" → chỉnh ở đây. */
  tempo: number;
};

export type SeriesInfo = {
  id: SeriesId;
  /** null = series không làm bằng pipeline kể chuyện (vd podcast NotebookLM). */
  tts: SeriesTts | null;
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
    tts: null,
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
    // Đã duyệt 2026-10-18: nữ Autonoe, tăng tốc 1.1 (đọc gốc hơi chậm).
    tts: {
      voice: "Autonoe",
      note:
        "Style: Warm, understanding, soft tone with gentle inflections. Pace: Natural conversational pace. " +
        "Accent: Northern Vietnamese (Hanoi) accent with standard Hanoi pronunciation, kept exactly the same from the first sentence to the last — never Southern Vietnamese. " +
        "Keep the same voice, tone and energy throughout the whole transcript.",
      tempo: 1.1,
    },
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
  "dong-ho-viet": {
    id: "dong-ho-viet",
    // Trước là pipeline reel riêng (reel/) — gộp vào studio 2026-10-18. Giọng nam dẫn phim
    // tài liệu: rõ, chắc, KHÔNG chậm, KHÔNG thủ thỉ / truyện ma (bài học từ 8 tập reel).
    tts: {
      voice: "Charon",
      note:
        "Style: Clear, warm male documentary narrator, sincere and grounded — engaging and human, not sentimental, never a whisper or a ghost-story tone. " +
        "Pace: Natural documentary narration pace, not slow. " +
        "Accent: Northern Vietnamese (Hanoi) accent with standard Hanoi pronunciation, kept exactly the same from the first sentence to the last — never Southern Vietnamese. " +
        "Keep the same voice, tone and energy throughout the whole transcript.",
      // Charon đọc gốc chậm (user nghe 2026-10-18) → 1.09 vừa tai.
      tempo: 1.09,
    },
    // Con triện rượu vang + vàng đồng trên nền kem — lấy từ icon reel/assets/app-icon.svg.
    palette: {
      bg: "#F4EBDD",
      bgAlt: "#EADBC4",
      ink: "#3A1A1F",
      inkMuted: "#7A5A55",
      white: "#FFFBF5",
      accentRed: "#7A2230",
      accentBlue: "#4A5D73",
      accentTeal: "#C19A5B",
      gridLine: "rgba(58, 26, 31, 0.07)",
    },
    channelName: "Dòng Họ Việt",
    slogan: "Gia đình · gia phả · ký ức · nguồn cội",
    description:
      "Dòng Họ Việt kể những câu chuyện về gia đình, gia phả và ký ức dòng họ — để mỗi người nhớ mình từ đâu tới và giữ lại điều ông bà trao truyền.",
    cta: "Theo dõi để giữ ký ức gia đình",
    logoFile: "brand/dong-ho-viet/mark.png",
    markFile: "brand/dong-ho-viet/mark.png",
    markZoom: 1,
    fbPageIdEnv: "FB_PAGE_ID_DONG_HO_VIET",
    playlistsFile: "_fb-playlists.dong-ho-viet.json",
  },
};

/** Tên kênh chia dòng ở " - " ("Chuyện Xưa - Ngẫm Nay" → 2 dòng) cho logo dạng chữ. */
export const channelNameLines = (s: SeriesInfo): string[] => s.channelName.split(/\s+-\s+/);

export const getSeries = (id: string | null | undefined): SeriesInfo =>
  SERIES[(SERIES_IDS as readonly string[]).includes(id ?? "") ? (id as SeriesId) : DEFAULT_SERIES];
