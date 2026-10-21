/**
 * Các series (kênh/Trang FB) dùng chung studio. Mỗi tập gắn `series` trong config
 * → nhận diện trong video (watermark, outro), công bố khi đăng, Trang FB, playlist
 * và đánh số tập ĐỀU tách theo series.
 *
 * File này KHÔNG import remotion → dùng được cả ở server lẫn composition.
 */
export const SERIES_IDS = ["bytecast", "chuyen-xua", "dong-ho-viet", "tien-tam-ly"] as const;
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
  /**
   * Có = kịch bản ĐỐI THOẠI 2 người (Gemini multi-speaker): mỗi dòng trong section bắt đầu
   * bằng "Tên: …" khớp `name`; `voice` ở trên bị bỏ qua. Caption/căn chữ tự bỏ tên người nói.
   */
  speakers?: Array<{ name: string; voice: string }>;
  /** Chuỗi filter ffmpeg chỉnh tiếng khi ghép (vd EQ bớt ồm). Áp sau atempo. */
  eq?: string;
};

/**
 * EQ cho giọng Gemini TTS (24kHz, dồn năng lượng dải trầm → nghe ồm): cắt rung dưới 90Hz,
 * bớt đục 180/350Hz, nâng vùng rõ chữ 3kHz + "không khí" 7kHz, nén nhẹ cho đều.
 * Đo 2026-10-19: chênh dải <250Hz so với 2kHz giảm từ ~14dB còn ~11dB.
 */
export const VOICE_CLARITY_EQ =
  "highpass=f=90,equalizer=f=180:t=q:w=1:g=-4,equalizer=f=350:t=q:w=1:g=-3," +
  "equalizer=f=3000:t=q:w=1.2:g=3,treble=g=3:f=7000,acompressor=threshold=-20dB:ratio=2.5:attack=10:release=150";

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
  /**
   * content_category khi đăng /{page}/videos (enum Graph: BEAUTY_FASHION, BUSINESS, CARS_TRUCKS,
   * COMEDY, CUTE_ANIMALS, ENTERTAINMENT, FAMILY, FOOD_HEALTH, HOME, LIFESTYLE, MUSIC, NEWS,
   * POLITICS, SCIENCE, SPORTS, TECHNOLOGY, VIDEO_GAMING, OTHER — không có EDUCATION).
   */
  fbContentCategory: string;
  /**
   * Gắn phụ đề SRT (CC) khi đăng. Mặc định TẮT: video đã có caption in cứng → CC có thể
   * hiện chồng 2 lớp chữ. Bật để thử SEO/accessibility trên 1 series.
   */
  fbUploadSrt: boolean;
  /** false = tập mới KHÔNG có thẻ hook mở đầu (đọc tiêu đề rồi vào nội dung luôn). */
  hookCard: boolean;
  /** Tông footage lúc render (footage-composite LOOK_FILTERS); null = giữ màu gốc. */
  footageLook: "vintage" | null;
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
    fbContentCategory: "LIFESTYLE",
    fbUploadSrt: false,
    hookCard: true,
    footageLook: null,
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
    fbContentCategory: "LIFESTYLE",
    fbUploadSrt: false,
    // 2026-10-21: BẬT lại — audio NotebookLM mở đầu chậm ("Này, đêm nay…") nên cần thẻ hook giữ người xem
    // (trước đây tắt vì kịch bản Gemini tự có câu hook). Từ tập 6.
    hookCard: true,
    footageLook: "vintage", // user 2026-10-18: footage cổ trang trắng đen/tối như ngày xưa, khớp cover
  },
  "dong-ho-viet": {
    id: "dong-ho-viet",
    // Trước là pipeline reel riêng (reel/) — gộp vào studio 2026-10-18. Giọng nam dẫn phim
    // tài liệu: rõ, chắc, KHÔNG chậm, KHÔNG thủ thỉ / truyện ma (bài học từ 8 tập reel).
    tts: {
      voice: "Alnilam",
      note:
        "Style: Clear, warm male documentary narrator, sincere and grounded — engaging and human, not sentimental, never a whisper or a ghost-story tone. " +
        "Pace: Natural documentary narration pace, not slow. " +
        "Accent: Northern Vietnamese (Hanoi) accent with standard Hanoi pronunciation, kept exactly the same from the first sentence to the last — never Southern Vietnamese. " +
        "Keep the same voice, tone and energy throughout the whole transcript.",
      // 2026-10-19 user đổi Charon → Alnilam (mẫu Tiền & Tâm Lý). Alnilam đọc gốc đã đủ nhanh
      // (~175 chữ/phút) → không tăng tốc; nghe tập đầu rồi chỉnh nếu cần.
      tempo: 1.0,
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
    fbContentCategory: "FAMILY",
    fbUploadSrt: false,
    // Từ 2026-10-21 audio = NotebookLM 1 người kể (mở chậm) → thẻ hook ~3.5s trước lời kể.
    // Tập Gemini TTS cũ đã đăng hết nên bật cho cả series.
    hookCard: true,
    footageLook: null,
  },
  "tien-tam-ly": {
    id: "tien-tam-ly",
    // Kênh kinh tế × tâm lý học hành vi, ĐỘC LẬP với ByteCast (user chốt 2026-10-19).
    // ĐỐI THOẠI 2 người dẫn (user duyệt mẫu 2026-10-19: độc thoại nghe "máy", kịch bản quá sách vở).
    // Minh (nam, Alnilam) kể chuyện + giải thích; Lan (nữ, Aoede) hỏi như người nghe bình thường.
    // Xưng hô: Minh xưng "tôi" gọi "chị"; Lan xưng "tôi" gọi "anh".
    tts: {
      voice: "Alnilam",
      speakers: [
        { name: "Minh", voice: "Alnilam" },
        { name: "Lan", voice: "Aoede" },
      ],
      note:
        "A relaxed, natural Vietnamese podcast conversation between two friends who host a show about money and everyday psychology. " +
        "They react to each other genuinely: small laughs, surprised 'ôi', thoughtful pauses, varied pace — never like reading a script, never like a newsreader. " +
        "Accent: both speak Northern Vietnamese (Hanoi) accent with standard Hanoi pronunciation, kept exactly the same from the first line to the last — never Southern Vietnamese.",
      tempo: 1.0,
      eq: VOICE_CLARITY_EQ,
    },
    // Bảng trắng: giấy ngà + mực chàm đậm; xanh lá = tăng/lãi, đỏ = lỗ/rủi ro, xanh dương = dữ kiện.
    palette: {
      bg: "#F7F5EF",
      bgAlt: "#ECE8DC",
      ink: "#1D2433",
      inkMuted: "#5B6475",
      white: "#FFFFFF",
      accentRed: "#C8372D",
      accentBlue: "#2F5D8A",
      accentTeal: "#2E8B57",
      gridLine: "rgba(29, 36, 51, 0.07)",
    },
    channelName: "Tiền & Tâm Lý",
    slogan: "Giải phẫu đồng tiền và bộ não",
    description:
      "Tiền & Tâm Lý mổ xẻ những câu chuyện tiền bạc có thật bằng số liệu kinh tế và tâm lý học hành vi — để hiểu vì sao người thông minh vẫn mất tiền, và cách giữ tiền tỉnh táo hơn.",
    cta: "Theo dõi để hiểu tiền rõ hơn",
    // Đồng xu chứa bộ não (Gemini, 2026-10-19) — ảnh Trang FB: brand/tien-tam-ly/fb-avatar.jpg + fb-cover.jpg.
    logoFile: "brand/tien-tam-ly/mark.png",
    markFile: "brand/tien-tam-ly/mark.png",
    markZoom: 1,
    fbPageIdEnv: "FB_PAGE_ID_TIEN_TAM_LY",
    playlistsFile: "_fb-playlists.tien-tam-ly.json",
    fbContentCategory: "BUSINESS",
    fbUploadSrt: false,
    hookCard: false, // hook "cú sốc" là câu mở đầu kịch bản (đọc thành tiếng)
    footageLook: null,
  },
};

/** Tên kênh chia dòng ở " - " ("Chuyện Xưa - Ngẫm Nay" → 2 dòng) cho logo dạng chữ. */
export const channelNameLines = (s: SeriesInfo): string[] => s.channelName.split(/\s+-\s+/);

export const getSeries = (id: string | null | undefined): SeriesInfo =>
  SERIES[(SERIES_IDS as readonly string[]).includes(id ?? "") ? (id as SeriesId) : DEFAULT_SERIES];
