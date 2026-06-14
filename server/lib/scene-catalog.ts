/**
 * Catalog tĩnh của 17 scene templates — metadata để show ở trang /scenes
 * (gallery quản lý). Chỉ READ-ONLY — composition vẫn nằm trong code React
 * `src/components/scenes/`. Edit composition = sửa file .tsx.
 *
 * Để thay đổi keywords match (cho `pickScene` auto-router) → edit
 * `src/scenes.ts` SCENE_KEYWORDS.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PATHS } from "./episode-store";

export type SceneCatalogEntry = {
  /** Tên scene type — khớp với SCENE_TYPES trong src/theme.ts */
  key: string;
  /** Tên hiển thị user-friendly */
  label: string;
  /** Mô tả mood / use case bằng tiếng Việt */
  description: string;
  /** Các sticker chính dùng trong composition */
  stickers: string[];
  /** Các doodle bổ trợ */
  doodles: string[];
  /** Từ khóa Vietnamese trigger cho pickScene auto-router */
  keywords: string[];
  /** Mood gợi ý phù hợp nhất */
  suggestedMoods: string[];
  /** Nhóm — để filter/sort */
  category:
    | "default"
    | "broadcast"
    | "dialogue"
    | "reflection"
    | "calm"
    | "emotion"
    | "social"
    | "thought"
    | "wisdom"
    | "giving"
    | "transformation";
};

export const SCENE_CATALOG: SceneCatalogEntry[] = [
  {
    key: "PodcastDesk",
    label: "Bàn podcast",
    description:
      "Cảnh mặc định — mic + tai nghe + cốc cà phê + sóng âm. Fallback khi không match keyword.",
    stickers: ["Mic", "Headphones", "CoffeeMug", "SmileyCloud"],
    doodles: ["Squiggle", "Sparkle", "StarSmall"],
    keywords: [],
    suggestedMoods: ["positive", "social"],
    category: "default",
  },
  {
    key: "Idea",
    label: "Ý tưởng",
    description:
      'Khoảnh khắc "à há" — bóng đèn lóe sáng + dấu hỏi + sao. Dùng cho phát hiện / nhận ra / lý trí.',
    stickers: ["Lightbulb", "QuestionMark", "Star"],
    doodles: ["Sparkle", "StarSmall", "Arrow"],
    keywords: [
      "ý tưởng",
      "khái niệm",
      "nhận thức",
      "à há",
      "phát hiện",
      "tỉnh ngộ",
      "hiểu ra",
      "nhận ra",
      "suy nghĩ",
      "lý trí",
      "logic",
      "tư duy",
    ],
    suggestedMoods: ["positive", "energetic"],
    category: "thought",
  },
  {
    key: "Connection",
    label: "Kết nối",
    description:
      "Mạng lưới điểm + trái tim + bong bóng thoại. Cho quan hệ / giao tiếp / yêu thương.",
    stickers: ["NetworkDots", "Heart", "SpeechBubble", "Phone"],
    doodles: ["DottedPath", "Sparkle"],
    keywords: [
      "kết nối",
      "quan hệ",
      "giao tiếp",
      "yêu thương",
      "tình bạn",
      "lan truyền",
      "liên kết",
      "chia sẻ",
      "trò chuyện",
      "gắn bó",
    ],
    suggestedMoods: ["social", "healing"],
    category: "social",
  },
  {
    key: "Crowd",
    label: "Đám đông",
    description:
      "Nhiều smiley face + cloud + sao. Cho xã hội / chuẩn mực / công chúng / tập thể.",
    stickers: ["SmileyFace"],
    doodles: ["Cloud", "StarSmall", "Sparkle"],
    keywords: [
      "đám đông",
      "xã hội",
      "chuẩn mực",
      "công chúng",
      "tập thể",
      "số đông",
      "nhiều người",
      "mọi người",
      "cộng đồng",
    ],
    suggestedMoods: ["social", "energetic"],
    category: "social",
  },
  {
    key: "InnerSelf",
    label: "Nội tâm",
    description:
      "Mặt nạ + bộ não + bong bóng thoại. Cho cảm xúc / bản ngã / chữa lành / nỗi đau.",
    stickers: ["Mask", "Brain", "SpeechBubble", "Heart"],
    doodles: ["Squiggle", "Sparkle"],
    keywords: [
      "cảm xúc",
      "ý thức",
      "vô thức",
      "bản ngã",
      "chữa lành",
      "tổn thương",
      "nội tâm",
      "im lặng",
      "tâm hồn",
      "bên trong",
      "cô đơn",
      "sợ hãi",
      "nỗi đau",
    ],
    suggestedMoods: ["contemplative", "healing"],
    category: "emotion",
  },
  {
    key: "Choice",
    label: "Lựa chọn",
    description:
      "Bảng chỉ đường + mũi tên + sao. Cho ngã ba / quyết định / tự do / nghịch lý.",
    stickers: ["Signpost"],
    doodles: ["Arrow", "DottedPath", "Sparkle", "StarSmall"],
    keywords: [
      "lựa chọn",
      "tự do",
      "quyết định",
      "ngã ba",
      "hướng đi",
      "nghịch lý",
      "đối mặt",
      "chọn lựa",
      "từ chối",
      "chấp nhận",
    ],
    suggestedMoods: ["contemplative", "energetic"],
    category: "thought",
  },
  {
    key: "Knowledge",
    label: "Tri thức",
    description:
      "Sách + notebook + cốc + cây. Cho học / thiền / chiêm nghiệm / triết học.",
    stickers: ["Books", "NotebookPaper", "CoffeeMug", "Plant"],
    doodles: ["Sparkle", "StarSmall", "Squiggle"],
    keywords: [
      "sách",
      "tri thức",
      "học",
      "đọc",
      "thiền",
      "chiêm nghiệm",
      "suy ngẫm",
      "hiểu biết",
      "nghiên cứu",
      "triết học",
      "tâm lý học",
      "khoa học",
    ],
    suggestedMoods: ["contemplative", "positive"],
    category: "wisdom",
  },
  // ───────── 10 scene mới ─────────
  {
    key: "OnAir",
    label: "On Air",
    description:
      'Mic to + badge "ON AIR" đỏ + confetti. Cho tuyên bố / mở đầu / "hôm nay tôi muốn nói".',
    stickers: ["Mic"],
    doodles: ["Squiggle", "Sparkle", "StarSmall", "Confetti"],
    keywords: [
      "hôm nay",
      "bắt đầu",
      "tuyên bố",
      "chia sẻ",
      "kể bạn",
      "nói thẳng",
      "tôi muốn nói",
      "hôm nay tôi",
      "mở đầu",
      "tuyên ngôn",
    ],
    suggestedMoods: ["energetic", "positive"],
    category: "broadcast",
  },
  {
    key: "DualMic",
    label: "Đối thoại 2 mic",
    description:
      "2 mic đối diện + speech bubble + 2 smiley face. Cho đối thoại / debate / 2 góc nhìn.",
    stickers: ["Mic", "SpeechBubble", "SmileyFace"],
    doodles: ["Arrow", "Sparkle", "StarSmall"],
    keywords: [
      "đối thoại",
      "tranh luận",
      "hai phía",
      "phản biện",
      "đối lập",
      "bàn luận",
      "trao đổi",
      "hai góc nhìn",
      "đôi bên",
      "debate",
    ],
    suggestedMoods: ["energetic", "social"],
    category: "dialogue",
  },
  {
    key: "Journal",
    label: "Nhật ký",
    description:
      "Notebook to + 4 sao check-mark + dấu hỏi. Cho tự vấn / liệt kê / nhìn lại.",
    stickers: ["NotebookPaper", "Star", "QuestionMark"],
    doodles: ["Sparkle", "StarSmall", "Arrow"],
    keywords: [
      "ghi chép",
      "nhật ký",
      "viết xuống",
      "liệt kê",
      "danh sách",
      "to-do",
      "tự hỏi",
      "nhìn lại",
      "reflect",
      "kiểm điểm",
    ],
    suggestedMoods: ["contemplative", "positive"],
    category: "reflection",
  },
  {
    key: "Morning",
    label: "Buổi sáng",
    description:
      "Coffee + cây + smiley cloud (mặt trời) + sparkle tỏa nắng. Cho slow living / khởi đầu ngày.",
    stickers: ["CoffeeMug", "Plant", "SmileyCloud"],
    doodles: ["Sparkle", "StarSmall", "Squiggle"],
    keywords: [
      "buổi sáng",
      "cà phê",
      "tỉnh dậy",
      "khởi đầu",
      "chậm rãi",
      "hiện diện",
      "tận hưởng",
      "sống chậm",
      "bình yên",
      "thư thái",
    ],
    suggestedMoods: ["positive", "healing"],
    category: "calm",
  },
  {
    key: "Listening",
    label: "Lắng nghe",
    description:
      "Headphones to + heart bên trong + sóng âm 2 bên. Cho empathy / lắng nghe / đồng cảm.",
    stickers: ["Headphones", "Heart"],
    doodles: ["Squiggle", "Sparkle", "StarSmall"],
    keywords: [
      "lắng nghe",
      "nghe thấy",
      "đồng cảm",
      "im lặng",
      "thấu hiểu",
      "cảm thông",
      "chú tâm",
      "chú ý",
      "nghe lòng",
      "nghe nhau",
    ],
    suggestedMoods: ["healing", "contemplative"],
    category: "emotion",
  },
  {
    key: "Voices",
    label: "Tiếng nói",
    description:
      "Brain center + 5 speech bubble đa màu (sticky note). Cho tiếng nói nội tâm / chatter / self-talk.",
    stickers: ["Brain", "SpeechBubble"],
    doodles: ["Sparkle", "StarSmall", "Squiggle"],
    keywords: [
      "tiếng nói",
      "chatter",
      "self-talk",
      "đầu óc",
      "suy nghĩ rối",
      "nội tâm ồn",
      "tiếng vọng",
      "hỗn loạn",
      "nhiều giọng",
      "tự nói",
    ],
    suggestedMoods: ["contemplative", "energetic"],
    category: "thought",
  },
  {
    key: "Growth",
    label: "Trưởng thành",
    description:
      "Cây to + heart + arrow up + sparkle thăng. Cho phát triển / kiên nhẫn / becoming.",
    stickers: ["Plant", "Heart"],
    doodles: ["Arrow", "Sparkle", "StarSmall"],
    keywords: [
      "trưởng thành",
      "phát triển",
      "lớn lên",
      "tiến bộ",
      "kiên nhẫn",
      "nuôi dưỡng",
      "từng bước",
      "hành trình",
      "becoming",
      "hành trang",
    ],
    suggestedMoods: ["positive", "healing"],
    category: "emotion",
  },
  {
    key: "Quote",
    label: "Châm ngôn",
    description:
      "Sách + speech bubble vàng to (quote highlight) + underline. Cho câu nói đắt / wisdom.",
    stickers: ["Books", "SpeechBubble", "Star"],
    doodles: ["Sparkle", "Underline", "StarSmall"],
    keywords: [
      "châm ngôn",
      "trích dẫn",
      "câu nói",
      "lời thầy",
      "danh ngôn",
      "triết lý sống",
      "câu chuyện hay",
      "smile bài học",
      "wisdom",
      "insight",
    ],
    suggestedMoods: ["contemplative", "positive"],
    category: "wisdom",
  },
  {
    key: "Doubt",
    label: "Hoài nghi",
    description:
      "Dấu hỏi cực to + brain mờ phía sau + 2 cloud + squiggle confused. Cho không chắc / uncertainty.",
    stickers: ["QuestionMark", "Brain"],
    doodles: ["Cloud", "Sparkle", "StarSmall", "Squiggle"],
    keywords: [
      "hoài nghi",
      "không chắc",
      "liệu rằng",
      "có thật",
      "do dự",
      "băn khoăn",
      "mơ hồ",
      "bối rối",
      "chần chừ",
      "uncertainty",
    ],
    suggestedMoods: ["contemplative", "healing"],
    category: "thought",
  },
  {
    key: "LettingGo",
    label: "Buông bỏ",
    description:
      "Heart to + dotted path đi lên + cloud trôi + sparkle bay. Cho chấp nhận / mất mát / release.",
    stickers: ["Heart"],
    doodles: ["Cloud", "DottedPath", "Sparkle", "StarSmall"],
    keywords: [
      "buông bỏ",
      "từ bỏ",
      "chia tay",
      "mất đi",
      "kết thúc",
      "chấp nhận mất",
      "giải phóng",
      "nhẹ lòng",
      "thanh thản",
      "release",
    ],
    suggestedMoods: ["healing", "contemplative"],
    category: "emotion",
  },
  // ───────── 5 scene Phase 3 — Giving / Transformation ─────────
  {
    key: "Sacrifice",
    label: "Trao đi",
    description:
      'Bàn tay cầm táo trái → arrow → bàn tay mở phải (đã trao). Heart bay lên ở giữa. Cho "cho đi vật chất" / "phép trừ khan hiếm".',
    stickers: ["HandOpen", "Apple", "Heart"],
    doodles: ["Arrow", "Sparkle", "StarSmall"],
    keywords: [
      "cho đi",
      "trao đi",
      "hy sinh",
      "nhường",
      "tặng",
      "dâng hiến",
      "phép trừ",
      "khan hiếm",
      "tước đoạt",
      "vơi đi",
      "đong đếm",
    ],
    suggestedMoods: ["healing", "contemplative"],
    category: "giving",
  },
  {
    key: "Metamorphosis",
    label: "Hóa bướm",
    description:
      'Kén → arrow → bướm bay. Confetti + sparkles. Cho "biến thái" / "lột xác" / "rũ bỏ cái tôi cũ" / hóa bướm.',
    stickers: ["Cocoon", "Butterfly"],
    doodles: ["Arrow", "Sparkle", "StarSmall", "Confetti"],
    keywords: [
      "biến thái",
      "lột xác",
      "chuyển hóa",
      "hóa bướm",
      "kén",
      "tan chảy",
      "rũ bỏ",
      "tái sinh",
      "tái cấu trúc",
      "metabola",
    ],
    suggestedMoods: ["positive", "energetic"],
    category: "transformation",
  },
  {
    key: "Bridge",
    label: "Cầu nối",
    description:
      'Cầu vòm + 2 smiley 2 đầu + heart trên đỉnh + dotted path qua cầu. Cho "kết nối tâm hồn" / "nối liền hai bờ".',
    stickers: ["Bridge", "SmileyFace", "Heart"],
    doodles: ["DottedPath", "Sparkle", "StarSmall"],
    keywords: [
      "cầu nối",
      "nối liền",
      "hai bờ",
      "bắc cầu",
      "khoảng cách",
      "chuyển giao",
      "vượt qua",
      "gắn kết sâu sắc",
      "nối bờ",
    ],
    suggestedMoods: ["social", "healing"],
    category: "social",
  },
  {
    key: "Mirror",
    label: "Soi gương",
    description:
      'Gương + người thật bên trái + arrow + reflection trong gương. Cho "looking-glass self" / "tự nhìn lại mình".',
    stickers: ["Mirror", "SmileyFace"],
    doodles: ["Arrow", "Sparkle", "StarSmall"],
    keywords: [
      "soi gương",
      "tấm gương",
      "phản chiếu",
      "phản gương",
      "nhìn lại mình",
      "nội tâm hóa",
      "looking glass",
      "gương",
    ],
    suggestedMoods: ["contemplative", "healing"],
    category: "reflection",
  },
  {
    key: "Threshold",
    label: "Ngưỡng cửa",
    description:
      'Cánh cửa hé mở + ánh sáng tỏa + dotted path dẫn tới cửa + heart/star 2 bên. Cho "ngưỡng cửa" / "chuyển giao tâm linh".',
    stickers: ["Door", "Heart", "Star"],
    doodles: ["DottedPath", "Sparkle", "StarSmall"],
    keywords: [
      "ngưỡng cửa",
      "bước qua",
      "ranh giới",
      "chuyển giao",
      "nghi thức",
      "thiêng liêng",
      "thế giới bên kia",
      "liên minh",
    ],
    suggestedMoods: ["contemplative", "healing"],
    category: "transformation",
  },
];

/**
 * Đếm số plan-segments đang dùng từng scene type. Quét tất cả
 * tmp/<name>.plan.json. Cost ~vài chục plan = nhanh.
 */
export async function countSceneUsage(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const entry of SCENE_CATALOG) counts[entry.key] = 0;

  let entries: string[] = [];
  try {
    entries = await fs.readdir(PATHS.TMP_DIR);
  } catch {
    return counts;
  }
  for (const f of entries) {
    if (!f.endsWith(".plan.json")) continue;
    try {
      const raw = await fs.readFile(path.join(PATHS.TMP_DIR, f), "utf-8");
      const parsed = JSON.parse(raw) as {
        scenes?: Array<{ sceneType?: string }>;
      };
      for (const s of parsed.scenes ?? []) {
        if (s.sceneType && counts[s.sceneType] !== undefined) {
          counts[s.sceneType] += 1;
        }
      }
    } catch {
      /* ignore corrupt plan */
    }
  }
  return counts;
}
