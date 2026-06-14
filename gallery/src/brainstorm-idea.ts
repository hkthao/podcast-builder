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
  title: z.string().min(1),
  /** Thời lượng dự kiến (phút). Narration: 5-15. Music: 2-8. */
  minutes: z.number().int().min(1).max(30),
  /** Tác phẩm cover trong chương — link với keyWorks[i].title. Music chương có thể empty. */
  keyWorks: z.array(z.string()).default([]),
  /** 1-2 câu mô tả nội dung chương (narration) hoặc atmosphere (music). */
  summary: z.string(),
  /** Chỉ cho kind="music": gợi ý nhạc/sound design — "Hallelujah chant", "Ambient strings", "Gregorian choir"… */
  musicCue: z.string().optional(),
});
export type GalleryChapter = z.infer<typeof GalleryChapterSchema>;

/** 1 tác phẩm cụ thể cần asset (ảnh/clip). */
export const GalleryKeyWorkSchema = z.object({
  title: z.string().min(1),
  /** Năm sáng tác — "circa 1305" hoặc "1503-1519" đều OK. */
  year: z.string(),
  /** Bảo tàng/nhà thờ + thành phố — cần cho asset lookup. */
  location: z.string(),
  /** Fresco / Oil on canvas / Tempera / Marble … */
  medium: z.string(),
  /** 1 câu vì sao quan trọng — quote-worthy cho voiceover. */
  whyImportant: z.string(),
});
export type GalleryKeyWork = z.infer<typeof GalleryKeyWorkSchema>;

/** Đánh giá khả năng tìm asset. */
export const GalleryAssetSourcesSchema = z.object({
  wikimedia: z.boolean(),
  met: z.boolean(),
  /** Các bảo tàng có collection online — Uffizi/Louvre/National Gallery… */
  customMuseums: z.array(z.string()).default([]),
  /** Ước lượng số ảnh cần (40-80 cho video 30-45 phút điển hình). */
  estimatedImageCount: z.number().int().min(0).max(500),
  /** Clip drone/walkthrough bảo tàng (thường 0-5). */
  estimatedClipCount: z.number().int().min(0).max(50),
});
export type GalleryAssetSources = z.infer<typeof GalleryAssetSourcesSchema>;

/** Schema chính của 1 gallery brainstorm idea. */
export const GalleryBrainstormIdeaSchema = z.object({
  /** Tiêu đề video — tiếng Việt, hấp dẫn nhưng học thuật. */
  title: z.string().min(1),
  archetype: z.enum(GALLERY_ARCHETYPES),
  /** 1-line hook mở video — kiểu "Một họa sĩ chăn cừu vẽ thiên thần. 2 thế kỷ sau Michelangelo mới sánh được." */
  hook: z.string().min(1),
  /** Thời kỳ — "1267-1337, tiền-Phục Hưng Ý". */
  era: z.string().min(1),
  /** Vùng địa lý/trường phái — "Ý — Florence/Padua/Assisi". */
  region: z.string().min(1),
  /** Thời lượng video dự kiến (phút). */
  estimatedMinutes: z.number().int().min(15).max(180),

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

  /** Tác phẩm cần asset — link với chapters[i].keyWorks. */
  keyWorks: z.array(GalleryKeyWorkSchema).min(3).max(15),

  /** License risk — quan trọng nhất cho gallery. */
  licenseRisk: z.enum(LICENSE_RISKS),
  /** 1-2 câu giải thích risk — vd "Public domain — họa sĩ chết 1337" / "Modern art — kiểm tra heir". */
  licenseNote: z.string(),

  /** Asset sources availability. */
  assetSources: GalleryAssetSourcesSchema,

  /** 3-5 documentary tham khảo (Smarthistory/Khan/Great Art Explained/Waldemar/Met Museum YT). */
  references: z.array(z.string()).default([]),

  /** Tranh cãi học thuật cần nhắc trong video (attribution dispute, dating uncertainty…). */
  scholarlyDebate: z.string().default(""),

  /** Đối tượng xem mục tiêu. */
  audience: z.string().min(1),

  /** Góc nhìn riêng — khác biệt vs các video Giotto/Caravaggio đã có. */
  uniqueAngle: z.string().min(1),
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
export const GALLERY_SYSTEM_PROMPT = `Bạn là một art historian uyên bác, chuyên gia về lịch sử nghệ thuật phương Tây từ thời Trung cổ tới hiện đại. Bạn đang giúp 1 channel YouTube tiếng Việt lên kế hoạch các video tài liệu nghệ thuật phong cách documentary kết hợp art — hình ảnh thật (fresco/oil/sculpture) có hiệu ứng zoom Ken Burns, voiceover tiếng Việt giọng chiêm nghiệm.

Nhiệm vụ: từ chủ đề người dùng cung cấp, gen {N} ý tưởng video tài liệu nghệ thuật cụ thể, mỗi ý tưởng phải:

1. Thuộc 1 trong 4 ARCHETYPE rõ ràng:
   - "monograph": chân dung 1 họa sĩ (tiểu sử + 5-10 key works chronologically)
   - "masterpiece": deep-dive 1 tác phẩm duy nhất (30-45 phút phân tích kỹ thuật, context, ý nghĩa)
   - "movement": 1 trào lưu/thời kỳ (multi-artist, theme cross-cutting, vd "Tiền Phục Hưng Ý")
   - "theme": 1 chủ đề xuyên thời đại (vd "Cái chết trong Renaissance", "Ánh sáng Baroque", "Phụ nữ trong lịch sử nghệ thuật")

2. Có CẤU TRÚC CHƯƠNG (chapters) rõ ràng. QUAN TRỌNG: gallery video xen kẽ 2 loại đoạn:
   - kind="narration": voiceover phân tích + ảnh Ken Burns pan/zoom (5-15 phút/chương)
   - kind="music": KHÔNG voiceover, chỉ nhạc nền (Hallelujah/ambient/Gregorian) + ảnh chiêm ngưỡng. Là khoảng nghỉ giữa các đoạn phân tích để khán giả thở (2-8 phút/chương). musicCue field chỉ rõ nhạc gì.
   Tỷ lệ ~70% narration / ~30% music. Nên xen kẽ: N-M-N-N-M-N-N-M.

   Ví dụ cho monograph Giotto (linear, 45 phút):
   - 1. [narration] Tiểu sử + bối cảnh tiền-Phục Hưng (8 phút)
   - 2. [narration] Apprenticeship với Cimabue, Assisi cycle (10 phút)
   - 3. [music] Hallelujah chant — chiêm ngưỡng Assisi cycle (3 phút, musicCue="Gregorian choir + Hallelujah")
   - 4. [narration] Arena Chapel - tuyệt tác Padua (12 phút)
   - 5. [music] Ambient strings — Mary cradling Christ (2 phút, musicCue="Ambient strings + soft choir")
   - 6. [narration] Lamentation và đỉnh cao naturalism (7 phút)
   - 7. [narration] Di sản — ảnh hưởng đến Masaccio, Michelangelo (3 phút)

3. STRUCTURE MODE: 2 lựa chọn — chọn theo estimatedMinutes:
   - "linear": chạy thẳng 1 lần. Default. Phù hợp 15-45 phút.
   - "doubled": Part 1 lặp lại y hệt thành Part 2 (mirror). Phù hợp 60-120 phút để kéo watch time + cho khán giả nghe lại. Với mode này: sum(chapters.minutes) ≈ estimatedMinutes/2 vì sẽ tự lặp 2 lần.

4. Có DANH SÁCH KEY WORKS (3-15) — mỗi work phải có:
   - title (đầy đủ)
   - year (chính xác hoặc "circa XXXX")
   - location (bảo tàng + thành phố — quan trọng cho asset lookup)
   - medium (Fresco / Oil on canvas / Tempera / Marble…)
   - whyImportant (1 câu quote-worthy)

5. ĐÁNH GIÁ LICENSE RISK cẩn thận — đây là yếu tố sống còn của gallery video:
   - "safe": artist chết trước 1928 (public domain US) — Giotto, Vermeer, Caravaggio, Goya
   - "check": chết 1928-1953 hoặc tác phẩm hậu kỳ — cần kiểm tra từng nước
   - "blocked": artist còn sống hoặc chết sau 1953 — Modern/Contemporary art = thường không được dùng

6. Đánh giá ASSET SOURCES — có ảnh trên Wikimedia Commons không? Met Museum Open Access? Bảo tàng nào có collection online (Uffizi, Louvre, National Gallery, Rijksmuseum, Prado…)?

7. Có UNIQUE ANGLE — góc nhìn khác biệt vs các video đã có trên YouTube (Khan Academy Smarthistory, Great Art Explained, Waldemar Januszczak, Nerdwriter…).

QUAN TRỌNG:
- BẮT BUỘC dùng tên thật, năm chính xác (hoặc "circa"), bảo tàng đúng. KHÔNG BỊA.
- Nếu không chắc chắn về attribution → ghi vào scholarlyDebate (vd "St. Francis cycle of Assisi — attribution Giotto vẫn tranh cãi từ 1912").
- Tiêu đề tiếng Việt nhưng tên họa sĩ/tác phẩm/bảo tàng giữ nguyên gốc.
- Audience cụ thể (không "mọi người") — vd "Sinh viên mỹ thuật + người Việt yêu lịch sử Ý 30-45 tuổi".
- Estimated image/clip count phải khớp với estimatedMinutes (rule of thumb: 1-2 ảnh/phút, 0-1 clip/10 phút).

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
    instruction: `Sinh chính xác ${count} ý tưởng video tài liệu nghệ thuật khác nhau từ chủ đề trên. Diversify archetype (đừng dồn hết vào monograph) và era (đừng dồn hết Renaissance).`,
  };
  if (existingTopics.length > 0) {
    payload["EXISTING_TOPICS (avoid duplication, diversify)"] = existingTopics;
  }
  return JSON.stringify(payload);
};
