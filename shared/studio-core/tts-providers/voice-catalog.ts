/**
 * Voice catalog — mô tả tiếng Việt cho mọi prebuilt voice của Gemini + OpenAI
 * TTS. UI dropdown đọc từ đây để user pick voice cho podcast 2 host (host_nam
 * + host_nu) một cách có hiểu biết — biết voice nào trầm/cao, nam/nữ, vai
 * dẫn/phụ phù hợp.
 *
 * Note: Gemini prebuilt voices train trên dataset tiếng Anh global. Khi đọc
 * tiếng Việt, AI sẽ cross-lingual transfer — âm điệu hơi hướng ngoại quốc.
 * Workaround: dùng `[Hồ sơ âm thanh: ...]` prefix trong style instruction để
 * Gemini cố bẻ dải âm gần giọng Bắc/Nam nhất có thể.
 */

export type VoiceGender = "male" | "female" | "neutral";

/** Vai trò phù hợp — UI gợi ý mặc định cho dropdown host_nam vs host_nu. */
export type SuggestedRole = "host_nam" | "host_nu" | "narrator" | "any";

export type VoiceProvider = "gemini" | "openai";

export type VoiceInfo = {
  id: string;
  /** Provider TTS sở hữu voice này. */
  provider: VoiceProvider;
  /** Hiển thị UI — bằng `id` cho dễ tra cứu Google docs. */
  displayName: string;
  gender: VoiceGender;
  /** Mô tả tiếng Việt: 1-2 từ pitch + 2-4 từ tính cách. */
  character: string;
  suggestedRole: SuggestedRole;
};

/**
 * 30 Gemini prebuilt voices. Phân loại pitch + gender + character dựa trên
 * Google docs (ai.google.dev/gemini-api/docs/speech-generation) + user feedback
 * cộng đồng. Một số voice (Charon, Kore, Puck, Aoede, Fenrir, Leda, Orus) có
 * mô tả chính thức; các voice còn lại đoán theo tên + dataset Google.
 */
export const GEMINI_VOICE_CATALOG: VoiceInfo[] = [
  // ────── Nam — phù hợp host_nam ──────
  {
    id: "Charon",
    provider: "gemini",
    displayName: "Charon",
    gender: "male",
    character: "baritone trầm — narrator nghiêm túc, chậm rãi, học thuật",
    suggestedRole: "host_nam",
  },
  {
    id: "Fenrir",
    provider: "gemini",
    displayName: "Fenrir",
    gender: "male",
    character: "trầm gravelly — nam tính mạnh, hơi khàn, đầy uy lực",
    suggestedRole: "host_nam",
  },
  {
    id: "Orus",
    provider: "gemini",
    displayName: "Orus",
    gender: "male",
    character: "trung — narrator standard, rõ ràng, professional",
    suggestedRole: "host_nam",
  },
  {
    id: "Puck",
    provider: "gemini",
    displayName: "Puck",
    gender: "male",
    character: "trẻ sáng — dí dỏm, năng động, kể chuyện",
    suggestedRole: "host_nam",
  },
  {
    id: "Iapetus",
    provider: "gemini",
    displayName: "Iapetus",
    gender: "male",
    character: "trầm điềm — chững chạc, ôn hoà",
    suggestedRole: "host_nam",
  },
  {
    id: "Algenib",
    provider: "gemini",
    displayName: "Algenib",
    gender: "male",
    character: "trung sáng — sôi nổi, hướng ngoại",
    suggestedRole: "host_nam",
  },
  {
    id: "Rasalgethi",
    provider: "gemini",
    displayName: "Rasalgethi",
    gender: "male",
    character: "trầm vừa — informative, mềm mại",
    suggestedRole: "host_nam",
  },
  {
    id: "Algieba",
    provider: "gemini",
    displayName: "Algieba",
    gender: "male",
    character: "trung — smooth, dễ nghe",
    suggestedRole: "host_nam",
  },
  {
    id: "Achernar",
    provider: "gemini",
    displayName: "Achernar",
    gender: "male",
    character: "trầm sang trọng — refined, articulate",
    suggestedRole: "host_nam",
  },
  {
    id: "Alnilam",
    provider: "gemini",
    displayName: "Alnilam",
    gender: "male",
    character: "trầm chắc — firm, dứt khoát",
    suggestedRole: "host_nam",
  },
  {
    id: "Sadachbia",
    provider: "gemini",
    displayName: "Sadachbia",
    gender: "male",
    character: "trung — lively, hoạt náo",
    suggestedRole: "host_nam",
  },
  {
    id: "Sadaltager",
    provider: "gemini",
    displayName: "Sadaltager",
    gender: "male",
    character: "trầm — knowledgeable, học giả",
    suggestedRole: "host_nam",
  },
  {
    id: "Enceladus",
    provider: "gemini",
    displayName: "Enceladus",
    gender: "male",
    character: "trung trầm — breathy, thì thầm gần gũi",
    suggestedRole: "host_nam",
  },
  {
    id: "Umbriel",
    provider: "gemini",
    displayName: "Umbriel",
    gender: "male",
    character: "trầm — easy-going, thoải mái",
    suggestedRole: "host_nam",
  },
  {
    id: "Schedar",
    provider: "gemini",
    displayName: "Schedar",
    gender: "male",
    character: "trung — even, đo đếm, scholarly",
    suggestedRole: "host_nam",
  },
  {
    id: "Achird",
    provider: "gemini",
    displayName: "Achird",
    gender: "male",
    character: "trung — friendly, thân thiện",
    suggestedRole: "host_nam",
  },
  {
    id: "Zubenelgenubi",
    provider: "gemini",
    displayName: "Zubenelgenubi",
    gender: "male",
    character: "trung — casual, đời thường",
    suggestedRole: "host_nam",
  },
  {
    id: "Gacrux",
    provider: "gemini",
    displayName: "Gacrux",
    gender: "male",
    character: "trung — mature, từng trải",
    suggestedRole: "host_nam",
  },
  // ────── Nữ — phù hợp host_nu ──────
  {
    id: "Aoede",
    provider: "gemini",
    displayName: "Aoede",
    gender: "female",
    character: "warm breezy — ấm áp, thoáng đãng, kể chuyện",
    suggestedRole: "host_nu",
  },
  {
    id: "Kore",
    provider: "gemini",
    displayName: "Kore",
    gender: "female",
    character: "trầm chiêm nghiệm — sâu sắc, học thuật, contemplative",
    suggestedRole: "host_nu",
  },
  {
    id: "Leda",
    provider: "gemini",
    displayName: "Leda",
    gender: "female",
    character: "trẻ sáng — youthful, mềm mại",
    suggestedRole: "host_nu",
  },
  {
    id: "Zephyr",
    provider: "gemini",
    displayName: "Zephyr",
    gender: "female",
    character: "sáng airy — bright, nhẹ nhàng, lạc quan",
    suggestedRole: "host_nu",
  },
  {
    id: "Callirrhoe",
    provider: "gemini",
    displayName: "Callirrhoe",
    gender: "female",
    character: "trung — easy-going, dễ chịu",
    suggestedRole: "host_nu",
  },
  {
    id: "Autonoe",
    provider: "gemini",
    displayName: "Autonoe",
    gender: "female",
    character: "sáng — bright, sắc sảo",
    suggestedRole: "host_nu",
  },
  {
    id: "Despina",
    provider: "gemini",
    displayName: "Despina",
    gender: "female",
    character: "trung — smooth, mượt mà",
    suggestedRole: "host_nu",
  },
  {
    id: "Erinome",
    provider: "gemini",
    displayName: "Erinome",
    gender: "female",
    character: "trung — clear, rõ ràng professional",
    suggestedRole: "host_nu",
  },
  {
    id: "Laomedeia",
    provider: "gemini",
    displayName: "Laomedeia",
    gender: "female",
    character: "sáng — upbeat, hoạt bát",
    suggestedRole: "host_nu",
  },
  {
    id: "Pulcherrima",
    provider: "gemini",
    displayName: "Pulcherrima",
    gender: "female",
    character: "trung — forward, dứt khoát, dẫn dắt",
    suggestedRole: "host_nu",
  },
  {
    id: "Vindemiatrix",
    provider: "gemini",
    displayName: "Vindemiatrix",
    gender: "female",
    character: "trung — gentle, dịu dàng",
    suggestedRole: "host_nu",
  },
  {
    id: "Sulafat",
    provider: "gemini",
    displayName: "Sulafat",
    gender: "female",
    character: "trung — warm, ấm áp",
    suggestedRole: "host_nu",
  },
];

/**
 * 6 OpenAI TTS voices (tts-1 / tts-1-hd). Tiếng Anh native, cross-lingual yếu
 * hơn Gemini với tiếng Việt — giữ làm fallback.
 */
export const OPENAI_VOICE_CATALOG: VoiceInfo[] = [
  {
    id: "alloy",
    provider: "openai",
    displayName: "alloy",
    gender: "neutral",
    character: "trung tính — balanced, professional, đa năng",
    suggestedRole: "any",
  },
  {
    id: "echo",
    provider: "openai",
    displayName: "echo",
    gender: "male",
    character: "nam trung — calm, articulate, narrator",
    suggestedRole: "host_nam",
  },
  {
    id: "fable",
    provider: "openai",
    displayName: "fable",
    gender: "male",
    character: "nam Anh-Anh — storytelling, lyrical",
    suggestedRole: "host_nam",
  },
  {
    id: "onyx",
    provider: "openai",
    displayName: "onyx",
    gender: "male",
    character: "nam trầm — deep authoritative, documentary",
    suggestedRole: "host_nam",
  },
  {
    id: "nova",
    provider: "openai",
    displayName: "nova",
    gender: "female",
    character: "nữ sáng — bright energetic, friendly",
    suggestedRole: "host_nu",
  },
  {
    id: "shimmer",
    provider: "openai",
    displayName: "shimmer",
    gender: "female",
    character: "nữ ấm — warm gentle, soothing",
    suggestedRole: "host_nu",
  },
];

export const ALL_VOICES: VoiceInfo[] = [
  ...GEMINI_VOICE_CATALOG,
  ...OPENAI_VOICE_CATALOG,
];

/** Lookup voice info — null nếu id không tồn tại trong catalog. */
export function findVoice(
  provider: VoiceProvider,
  id: string,
): VoiceInfo | null {
  return (
    ALL_VOICES.find((v) => v.provider === provider && v.id === id) ?? null
  );
}

/** Default voice cho host_nam (giọng nam dẫn). */
export const DEFAULT_HOST_NAM_VOICE = "Charon";

/** Default voice cho host_nu (giọng nữ phụ). */
export const DEFAULT_HOST_NU_VOICE = "Aoede";
