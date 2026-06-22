/**
 * Gallery brainstorm schema — KHÁC podcast hoàn toàn.
 *
 * Podcast brainstorm = idea triết học/tâm lý 1 góc nhìn (title/hook/angle/why).
 * Gallery brainstorm = chủ đề video tài liệu nghệ thuật có cấu trúc chương,
 * danh sách tác phẩm, license risk, asset sources.
 *
 * Lưu chung table `brainstorm_sessions` với cột `ideas_json` opaque + `style`
 * discriminator. Server branch theo style để parse/validate.
 */
import { z } from "zod";

/** Bốn archetype video tài liệu nghệ thuật. */
export const GALLERY_ARCHETYPES = [
  "monograph",    // Chân dung họa sĩ (tiểu sử + key works)
  "masterpiece",  // Deep-dive 1 tác phẩm 30-45 phút
  "movement",     // Trào lưu/thời kỳ (multi-artist, theme cross-cutting)
  "theme",        // Chủ đề xuyên suốt (vd "Cái chết trong Renaissance")
] as const;
export type GalleryArchetype = (typeof GALLERY_ARCHETYPES)[number];

/** License risk — gallery sống chết bởi cái này. */
export const LICENSE_RISKS = ["safe", "check", "blocked"] as const;
export type LicenseRisk = (typeof LICENSE_RISKS)[number];

/**
 * Loại đoạn (segment kind) — gallery video xen kẽ 2 dạng:
 * - "narration": voiceover + ảnh Ken Burns pan/zoom phân tích tác phẩm
 * - "music": chỉ nhạc nền (Hallelujah/ambient strings) + ảnh chiêm ngưỡng,
 *   KHÔNG voiceover. Dùng làm khoảng nghỉ giữa các đoạn phân tích.
 *
 * Tỷ lệ thường gặp: ~70% narration / ~30% music interlude.
 */
export const CHAPTER_KINDS = ["narration", "music"] as const;
export type ChapterKind = (typeof CHAPTER_KINDS)[number];

/**
 * Cấu trúc tổng thể video:
 * - "linear": chạy thẳng 1 lần A→B→C (default — phù hợp 15-45 phút)
 * - "doubled": Part 1 (A→B→C) + Part 2 lặp lại y hệt (A→B→C). Phù hợp video
 *   60-120 phút để kéo watch time + cho khán giả nghe lại. Sample Giotto
 *   (2h03) dùng pattern này.
 */
export const STRUCTURE_MODES = ["linear", "doubled"] as const;
export type StructureMode = (typeof STRUCTURE_MODES)[number];

/** 1 chương = 1 đoạn narration hoặc music. */
export const GalleryChapterSchema = z.object({
  kind: z.enum(CHAPTER_KINDS).default("narration"),
  // Cho phép rỗng: music interlude LLM hay để title trống — đừng fail cả idea.
  title: z.string().default(""),
  /**
   * Thời lượng dự kiến (phút). Narration: 5-15. Music: 2-8.
   * Default 5 nếu LLM quên field (coerce + default để không fail cả idea —
   * thực tế gpt-4o-mini hay bỏ sót `minutes`).
   */
  minutes: z.coerce.number().int().min(1).max(30).default(5),
  /** Tác phẩm cover trong chương — link với keyWorks[i].title. Music chương có thể empty. */
  keyWorks: z.array(z.string()).default([]),
  /** 1-2 câu mô tả nội dung chương (narration) hoặc atmosphere (music). */
  summary: z.string().default(""),
  /** Chỉ cho kind="music": gợi ý nhạc/sound design — "Hallelujah chant", "Ambient strings", "Gregorian choir"… */
  musicCue: z.string().optional(),
  /**
   * Chỉ cho kind="music": override độ dài interlude theo GIÂY (vd 10 = transition
   * ngắn). Nếu set, render dùng giá trị này thay vì `minutes × 60`. Cho phép
   * interlude dưới 1 phút mà không đụng `minutes` (int ≥ 1).
   */
  interludeSeconds: z.coerce.number().min(1).max(600).optional(),
});
export type GalleryChapter = z.infer<typeof GalleryChapterSchema>;

/** 1 tác phẩm cụ thể cần asset (ảnh/clip). */
export const GalleryKeyWorkSchema = z.object({
  title: z.string().default(""),
  /** Năm/niên đại — "circa 380 TCN", "1781", "thế kỷ V TCN" đều OK. */
  year: z.string().default(""),
  /** Nơi gắn liền (Athens, Königsberg…) — cho b-roll bối cảnh + tìm tượng. */
  location: z.string().default(""),
  /** Loại hình ảnh — "Tượng bán thân" / "Chân dung" / "Ẩn dụ thị giác"… */
  medium: z.string().default(""),
  /** 1 câu vì sao quan trọng — quote-worthy cho voiceover. */
  whyImportant: z.string().default(""),
});
export type GalleryKeyWork = z.infer<typeof GalleryKeyWorkSchema>;

/** Đánh giá khả năng tìm asset. */
export const GalleryAssetSourcesSchema = z.object({
  wikimedia: z.boolean().default(true),
  met: z.boolean().default(false),
  /** Bảo tàng/nguồn collection online — British Museum, Louvre antiquities… */
  customMuseums: z.array(z.string()).default([]),
  /** Ước lượng số ảnh cần. */
  estimatedImageCount: z.coerce.number().int().min(0).max(500).default(0),
  /** Số b-roll clip ẩn dụ (triết học nghiêng về clip động). */
  estimatedClipCount: z.coerce.number().int().min(0).max(50).default(0),
});
export type GalleryAssetSources = z.infer<typeof GalleryAssetSourcesSchema>;

/** Schema chính của 1 gallery brainstorm idea. */
export const GalleryBrainstormIdeaSchema = z.object({
  /** Tiêu đề video — tiếng Việt, hấp dẫn nhưng học thuật. */
  title: z.string().min(1),
  archetype: z.enum(GALLERY_ARCHETYPES),
  /** 1-line hook mở video. */
  hook: z.string().default(""),
  /** Thời kỳ — "thế kỷ V TCN, Hy Lạp cổ đại". */
  era: z.string().default(""),
  /** Vùng/trường phái — "Hy Lạp — Athens" / "Đức — Königsberg". */
  region: z.string().default(""),
  /** Thời lượng video dự kiến (phút). Nới min để chấp short. */
  estimatedMinutes: z.coerce.number().int().min(1).max(300).default(20),

  /**
   * Cấu trúc tổng thể — linear (chạy 1 lần) hoặc doubled (Part1+Part2 mirror).
   * Default linear. Doubled chỉ recommend cho estimatedMinutes >= 60.
   */
  structureMode: z.enum(STRUCTURE_MODES).default("linear"),

  /**
   * Danh sách chương (kể cả music interlude). Cho structureMode="linear":
   * sum(chapters.minutes) ≈ estimatedMinutes. Cho "doubled": sum ≈ estimatedMinutes/2
   * vì sẽ lặp 2 lần.
   *
   * Nên xen kẽ narration với music interlude: vd N-M-N-N-M-N-N-M để có
   * khoảng thở. Tỷ lệ narration/music ~70/30.
   */
  chapters: z.array(GalleryChapterSchema).min(3).max(15),

  /**
   * Tác phẩm cần asset — link với chapters[i].keyWorks. Cho phép RỖNG: chủ đề
   * lịch sử/triết học (vd "thế giới trước triết học") không xoay quanh tác phẩm
   * nghệ thuật cụ thể nên LLM trả [] — không nên fail cả idea vì điều đó.
   */
  keyWorks: z.array(GalleryKeyWorkSchema).max(15).default([]),

  /** License risk — mặc định safe (triết gia cổ đại PD). */
  licenseRisk: z.enum(LICENSE_RISKS).default("safe"),
  /** 1-2 câu giải thích risk. */
  licenseNote: z.string().default(""),

  /** Asset sources availability. */
  assetSources: GalleryAssetSourcesSchema.default({}),

  /** 3-5 nguồn tham khảo (SEP/IEP/Crash Course Philosophy/Philosophize This!…). */
  references: z.array(z.string()).default([]),

  /** Tranh cãi học thuật cần nhắc (vd "vấn đề Socrates", dating uncertainty…). */
  scholarlyDebate: z.string().default(""),

  /** Đối tượng xem mục tiêu. */
  audience: z.string().default(""),

  /** Góc nhìn riêng — khác biệt vs nội dung triết học đã có. */
  uniqueAngle: z.string().default(""),
});
export type GalleryBrainstormIdea = z.infer<typeof GalleryBrainstormIdeaSchema>;

/** Era enum để filter/categorize gallery sessions. */
export const GALLERY_ERAS = [
  "Ancient",
  "Medieval",
  "Early-Renaissance",
  "High-Renaissance",
  "Mannerism",
  "Baroque",
  "Rococo",
  "Neoclassical",
  "Romanticism",
  "Realism",
  "Impressionism",
  "Post-Impressionism",
  "Modern",
  "Contemporary",
] as const;
export type GalleryEra = (typeof GALLERY_ERAS)[number];

/** Region để filter — chỉ dùng cho monograph/movement. */
export const GALLERY_REGIONS = [
  "Italian",
  "Dutch-Flemish",
  "French",
  "Spanish",
  "German",
  "English",
  "American",
  "Asian",
  "Russian",
  "Other",
] as const;
export type GalleryRegion = (typeof GALLERY_REGIONS)[number];

/** System prompt cho LLM gen gallery ideas. Hoàn toàn khác podcast prompt. */
export const GALLERY_SYSTEM_PROMPT = `Bạn là một nhà nghiên cứu LỊCH SỬ TRIẾT HỌC uyên bác, am hiểu sâu triết học phương Tây từ Hy Lạp cổ đại tới hiện đại (và triết học phương Đông khi liên quan). Bạn đang giúp 1 channel YouTube tiếng Việt lên kế hoạch các video tài liệu TRIẾT HỌC phong cách documentary chiêm nghiệm: voiceover tiếng Việt giọng trầm, hình ảnh ẩn dụ (b-roll: bầu trời sao, tàn tích cổ, ngọn nến, biển động, sương mù…) + tượng bán thân / chân dung triết gia (public domain) có hiệu ứng zoom Ken Burns.

Nhiệm vụ: từ chủ đề người dùng cung cấp, gen {N} ý tưởng video tài liệu triết học cụ thể, mỗi ý tưởng phải:

1. Thuộc 1 trong 4 ARCHETYPE rõ ràng:
   - "monograph": chân dung 1 TRIẾT GIA theo CÔNG THỨC 6 PHẦN đặc trưng của kênh (xem mục 2) — gộp bối cảnh + cuộc đời + tư tưởng + tác phẩm + ảnh hưởng + bài học thời AI vào 1 video 15-20 phút. Vd Socrates, Plato, Nietzsche, Kant, Camus.
   - "masterpiece": deep-dive 1 TÁC PHẨM hoặc 1 LUẬN ĐIỂM lớn (phân tích bối cảnh, lập luận, ý nghĩa) — vd "Cộng hòa" của Plato và ngụ ngôn cái hang; "Cogito ergo sum" của Descartes.
   - "movement": 1 TRƯỜNG PHÁI / THỜI KỲ (multi-thinker, mạch tư tưởng xuyên suốt) — vd Tiền-Socrates, Khắc kỷ, Khai sáng, Hiện sinh.
   - "theme": 1 CÂU HỎI / CHỦ ĐỀ xuyên thời đại — vd "Tự do ý chí", "Thế nào là công bằng?", "Cái chết trong triết học", "Hạnh phúc là gì", "Thế giới trước khi có triết học".

2. Có CẤU TRÚC CHƯƠNG (chapters) rõ ràng. QUAN TRỌNG: video xen kẽ 2 loại đoạn:
   - kind="narration": voiceover phân tích + hình ảnh Ken Burns pan/zoom (5-15 phút/chương)
   - kind="music": KHÔNG voiceover, chỉ nhạc nền (ambient/neo-classical/piano/cello trầm) + hình ảnh chiêm ngưỡng. Là khoảng nghỉ giữa các đoạn phân tích để khán giả ngẫm (2-8 phút/chương). musicCue field chỉ rõ nhạc gì.
   Tỷ lệ ~70% narration / ~30% music. Có thể chèn 1-2 music interlude ngắn (1-2 phút) giữa các phần để khán giả thở.

   ⭐ CÔNG THỨC CHUẨN cho archetype "monograph" — 1 TRIẾT GIA = 1 video 15-20 phút gộp đúng 6 PHẦN (đây là FORMAT ĐẶC TRƯNG của kênh, monograph PHẢI theo cấu trúc này), mỗi phần ~2.5-3.5 phút, structureMode="linear":
   - 1. [narration] BỐI CẢNH LỊCH SỬ — thời đại/xã hội/chiến tranh/niềm tin đương thời + vì sao xã hội cần một người như họ. Tiêu đề kiểu: "Socrates xuất hiện trong thời đại hỗn loạn như thế nào?"
   - 2. [narration] CUỘC ĐỜI — nơi sinh, gia đình, biến cố lớn, những người ảnh hưởng tới họ. "Cuộc đời bi kịch của Socrates"
   - 3. [narration] TƯ TƯỞNG CỐT LÕI — luận điểm/phương pháp trung tâm. "Một câu nói của Socrates đã thay đổi giáo dục phương Tây"
   - 4. [narration] TÁC PHẨM — văn bản lưu giữ tư tưởng (nếu không tự viết thì qua học trò, vd Socrates qua Plato "The Republic"). "Cuốn sách đã lưu giữ Socrates suốt 2400 năm"
   - 5. [narration] ẢNH HƯỞNG ĐẾN THẾ GIỚI — tác động tới hậu thế + khoa học/tư duy hiện đại. "Nếu không có Socrates, thế giới hôm nay sẽ khác thế nào?"
   - 6. [narration] BÀI HỌC CHO THỜI ĐẠI AI — ⭐ ĐIỂM KHÁC BIỆT của kênh: triết gia này sẽ nói gì với chúng ta trong thời ChatGPT/AI. "Điều Socrates sẽ nói với chúng ta trong thời đại ChatGPT"
   (Có thể chèn 1 music interlude ngắn ~giữa video, vd sau phần 3 hoặc 4.) Với "movement"/"theme"/"masterpiece" thì KHÔNG bắt buộc 6 phần — chia chương theo logic chủ đề.

3. STRUCTURE MODE: 2 lựa chọn — chọn theo estimatedMinutes:
   - "linear": chạy thẳng 1 lần. Default. Phù hợp 15-45 phút.
   - "doubled": Part 1 lặp lại y hệt thành Part 2 (mirror). Phù hợp 60-120 phút để kéo watch time + cho khán giả nghe lại. Với mode này: sum(chapters.minutes) ≈ estimatedMinutes/2 vì sẽ tự lặp 2 lần.

4. DANH SÁCH KEY WORKS (0-15) — các MỐC cần hình ảnh (triết gia / tác phẩm / biểu tượng-bối cảnh). CÓ THỂ ĐỂ RỖNG nếu chủ đề trừu tượng không gắn nhân vật cụ thể. Mỗi mục:
   - title: tên triết gia HOẶC tác phẩm HOẶC khái niệm (vd "Socrates", "The Republic", "Ngụ ngôn cái hang")
   - year: niên đại — "circa 380 TCN", "1781", "thế kỷ V TCN"
   - location: nơi gắn liền (Athens, Königsberg, Paris…) — dùng tìm tượng/chân dung + b-roll bối cảnh
   - medium: LOẠI hình ảnh — "Tượng bán thân" / "Chân dung sơn dầu" / "Bản in tác phẩm cổ" / "Bối cảnh lịch sử" / "Ẩn dụ thị giác"
   - whyImportant: 1 câu vì sao quan trọng

5. ĐÁNH GIÁ LICENSE RISK — LƯU Ý: tư tưởng/văn bản triết học KHÔNG có bản quyền (ý tưởng tự do). Rủi ro chỉ nằm ở ẢNH CHỤP chân dung hiện đại:
   - "safe": triết gia cổ đại/cổ điển — tượng bán thân + chân dung vẽ đều public domain (Socrates, Plato, Aristotle, Descartes, Hume, Kant). B-roll ẩn dụ stock luôn free.
   - "check": triết gia mất 1928-1953 — ảnh chụp chân dung có thể vướng bản quyền nhiếp ảnh (Wittgenstein m.1951, Husserl m.1938) → ưu tiên b-roll ẩn dụ.
   - "blocked": triết gia còn sống / mất sau 1953 (Sartre m.1980, Foucault m.1984) — ảnh chụp thường còn bản quyền → KHÔNG dùng ảnh chụp, chỉ b-roll ẩn dụ.

6. Đánh giá ASSET SOURCES — tượng/chân dung triết gia trên Wikimedia Commons (rất sẵn cho cổ đại)? Met Museum (tượng bán thân cổ đại)? Với triết học hiện đại, chủ yếu dựa vào b-roll ẩn dụ (stock) → estimatedClipCount thường CAO hơn art. customMuseums có thể để [] hoặc bảo tàng cổ vật (British Museum, Louvre antiquities).

7. Có UNIQUE ANGLE — góc nhìn khác biệt vs các nội dung triết học đã có (Crash Course Philosophy, The School of Life, Philosophize This!, SEP/IEP).

QUAN TRỌNG:
- BẮT BUỘC dùng tên triết gia thật, năm sinh/mất + năm tác phẩm chính xác (hoặc "circa"). KHÔNG BỊA.
- Diễn giải gây tranh cãi → ghi vào scholarlyDebate (vd "Socrates không để lại văn bản — ta chỉ biết ông qua Plato và Xenophon, gọi là 'vấn đề Socrates'").
- Tiêu đề tiếng Việt nhưng tên triết gia/tác phẩm giữ nguyên gốc (Socrates, "The Republic", "Phê phán lý tính thuần túy").
- Audience cụ thể (không "mọi người") — vd "Người Việt 20-40 tuổi yêu triết học & lịch sử tư tưởng, sinh viên khoa học xã hội".
- Estimated image/clip count khớp estimatedMinutes (1-2 hình/phút). Triết học ít tác phẩm tĩnh → nghiêng về b-roll ẩn dụ động, estimatedClipCount cao.

Output JSON CHẶT theo schema sau (KHÔNG markdown wrap, KHÔNG lời mở đầu):

{
  "ideas": [
    {
      "title": "...",
      "archetype": "monograph"|"masterpiece"|"movement"|"theme",
      "hook": "...",
      "era": "...",
      "region": "...",
      "estimatedMinutes": <int>,
      "structureMode": "linear"|"doubled",
      "chapters": [
        {"kind":"narration"|"music","title":"...","minutes":<int>,"keyWorks":["..."],"summary":"...","musicCue":"..."(only if kind=music)}
      ],
      "keyWorks": [
        {"title":"...","year":"...","location":"...","medium":"...","whyImportant":"..."}
      ],
      "licenseRisk": "safe"|"check"|"blocked",
      "licenseNote": "...",
      "assetSources": {
        "wikimedia": true|false,
        "met": true|false,
        "customMuseums": ["..."],
        "estimatedImageCount": <int>,
        "estimatedClipCount": <int>
      },
      "references": ["...","..."],
      "scholarlyDebate": "...",
      "audience": "...",
      "uniqueAngle": "..."
    }
  ]
}`;

export const buildGalleryUserPrompt = (
  topic: string,
  count: number,
  existingTopics: string[] = [],
): string => {
  const payload: Record<string, unknown> = {
    topic,
    count,
    instruction: `Sinh chính xác ${count} ý tưởng video tài liệu TRIẾT HỌC khác nhau từ chủ đề trên. Diversify archetype (đừng dồn hết vào monograph) và thời kỳ (đừng dồn hết cổ đại Hy Lạp).`,
  };
  if (existingTopics.length > 0) {
    payload["EXISTING_TOPICS (avoid duplication, diversify)"] = existingTopics;
  }
  return JSON.stringify(payload);
};
