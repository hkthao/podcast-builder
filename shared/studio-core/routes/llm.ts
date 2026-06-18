import { Hono } from "hono";
import {
  chat,
  listOpenAIModels,
  listOllamaModels,
  type LLMModel,
  type LLMProvider,
} from "../llm-providers";
import { safeParseJson } from "../../lib/safe-json";

export const llmRoutes = new Hono();

/**
 * Bảng model khả dụng cho UI dropdown.
 * - openai: hardcoded list (chỉ trả nếu OPENAI_API_KEY có)
 * - ollama: query `http://localhost:11434/api/tags`, trả [] nếu Ollama không chạy
 */
llmRoutes.get("/models", async (c) => {
  const [openai, ollama] = await Promise.all([
    listOpenAIModels(),
    listOllamaModels(),
  ]);
  const result: Record<string, LLMModel[]> = { openai, ollama };
  return c.json(result);
});

const SOCIAL_CAPTION_SYSTEM = `Bạn là social media editor cho podcast tiếng Việt "ByteCast Tech" — kênh khám phá triết học, tâm lý học, AI, xã hội. Style: chiêm nghiệm, sâu sắc, MỘC MẠC, văn nói thật.

Nhiệm vụ: Tạo caption + hashtags cho Facebook Reels CHẠM CẢM XÚC theo cấu trúc THANG BẬC (staircase) khiến người scroll phải dừng + reply.

═══ CẤU TRÚC CAPTION (TIẾNG VIỆT) — staircase 8-12 dòng ═══

DÒNG 1 — HOOK MỞ (= title hoặc paraphrase rất gần, dạng "Nếu..." / "Khi..." / "Có bao giờ..." / "Liệu..."). Thường có dấu ba chấm "…" cuối câu để dẫn dắt.

DÒNG 2 — CÂU HỎI ĐÓNG ĐINH cho khán giả, dạng "Theo bạn... là ai/cái gì?", "Bạn nghĩ sao?".

DÒNG 3-6 — DANH SÁCH NGẮN (mỗi dòng 1-3 từ), liệt kê options đời thường khán giả tự nhận diện được. Mỗi dòng = 1 option ngắn, có dấu "?" cuối nếu là phỏng đoán. VÍ DỤ cho tập về cô đơn:
  Mẹ?
  Bạn thân?
  Người yêu?
  Hay... sẽ chẳng ai nhận ra?

DÒNG 7-9 — TWIST INSIGHT (1-2 câu chiêm nghiệm, đảo chiều câu chuyện): "Đôi khi điều đáng sợ nhất không phải là X. Mà là Y." → để Y CHẠM PAIN POINT thật.

DÒNG CUỐI — CALL-TO-ACTION DẠNG HỎI MỞ buộc user reply: "Nếu phải chọn 1 người, đó là ai?" / "Bạn đã từng cảm thấy thế chưa?" / "Đêm nay bạn nghĩ về điều gì?". KHÔNG dùng "comment dưới đây" / "share nếu thấy đúng" — quá quảng cáo.

═══ GOLD STANDARD EXAMPLE (CHỦ ĐỀ KHÁC) ═══

Nếu biến mất khỏi mạng xã hội 30 ngày...
Theo bạn ai sẽ là người đầu tiên đi tìm mình?
Mẹ?
Bạn thân?
Người yêu?
Hay... sẽ chẳng ai nhận ra?
Đôi khi điều đáng sợ nhất không phải là cô đơn.
Mà là nhận ra mình có rất nhiều người quen nhưng rất ít người thực sự quan tâm.
Nếu phải chọn 1 người chắc chắn sẽ tìm bạn,
đó là ai?

Quan sát kỹ: 10 dòng, mở bằng "Nếu…", liệt kê 4 options 1-3 từ, twist "Đôi khi điều đáng sợ nhất...", chốt CTA hỏi mở. Cấu trúc này là khung — bạn viết NỘI DUNG mới hợp chủ đề tập, KHÔNG copy từ.

═══ YÊU CẦU CHUNG ═══

- Văn NÓI tự nhiên, KHÔNG học thuật. Câu 5-12 từ là vừa.
- KHÔNG cụm sáo: "không thể phủ nhận", "trong cuộc sống hối hả", "guồng quay cuộc sống", "thời đại 4.0".
- 0-1 EMOJI cả caption (FB ranking minimal emoji).
- KHÔNG nhúng hashtag trong caption.
- KHÔNG có dấu chấm than "!" — staircase này tone trầm chiêm nghiệm, dùng "?" và "." là đủ.

═══ HASHTAGS — FB Reels best practice ═══

- ĐÚNG 3-5 hashtag (không stuff).
- 1 brand: bytecast HOẶC bytecasttech.
- 2-3 chủ đề cụ thể tập (trietoc, tamlyhoc, suyngam, codon, ketnoi, …).
- 0-1 tiếng Anh phổ biến nếu chủ đề universal (philosophy, mindfulness, lonely).
- Lowercase, không dấu, không space.

═══ OUTPUT JSON ═══

{
  "caption": "string — caption đầy đủ 8-12 dòng, line breaks là \\n",
  "hashtags": ["string", ...]
}

Chỉ trả JSON object — KHÔNG markdown wrap, KHÔNG lời mở đầu.`;

llmRoutes.post("/social-caption", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body không phải JSON hợp lệ" }, 400);
  }
  const {
    title,
    hook,
    essayContent,
    provider,
    model,
  } = body as {
    title?: string;
    hook?: string | null;
    essayContent?: string;
    provider?: LLMProvider;
    model?: string;
  };
  if (typeof title !== "string" || !title.trim()) {
    return c.json({ error: "Thiếu title" }, 400);
  }
  if (typeof provider !== "string" || typeof model !== "string") {
    return c.json({ error: "Thiếu provider/model" }, 400);
  }

  // Build user content
  const parts: string[] = [`Tiêu đề: ${title}`];
  if (hook) parts.push(`Hook: ${hook}`);
  if (essayContent && essayContent.length > 0) {
    // Limit essay content snippet to keep prompt manageable
    const snippet = essayContent.slice(0, 2500);
    parts.push(`\nNội dung essay (snippet):\n${snippet}`);
  }
  parts.push(
    `\nViết caption + hashtags cho Reels của episode này. Trả JSON object.`,
  );

  try {
    const result = await chat({
      provider,
      model,
      systemPrompt: SOCIAL_CAPTION_SYSTEM,
      userContent: parts.join("\n"),
      temperature: 0.85,
      jsonMode: true,
    });
    let parsed: { caption?: string; hashtags?: string[] };
    try {
      parsed = safeParseJson<{ caption?: string; hashtags?: string[] }>(result);
    } catch (e) {
      return c.json(
        { error: `LLM trả invalid JSON: ${(e as Error).message}` },
        500,
      );
    }
    if (typeof parsed.caption !== "string") {
      return c.json(
        { error: "LLM thiếu field caption trong response" },
        500,
      );
    }
    const caption = parsed.caption.trim();
    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags
          .filter((h): h is string => typeof h === "string")
          .map((h) =>
            h.replace(/^#/, "").trim().replace(/\s+/g, "").toLowerCase(),
          )
          .filter((h) => h.length > 0)
          // Cap 5 theo FB Reels recommendation (LLM thi thoảng vẫn vượt)
          .slice(0, 5)
      : [];
    return c.json({ caption, hashtags });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});
