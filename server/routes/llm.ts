import { Hono } from "hono";
import {
  chat,
  listOpenAIModels,
  listOllamaModels,
  type LLMModel,
  type LLMProvider,
} from "../lib/llm-providers";
import { safeParseJson } from "../lib/safe-json";

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

const SOCIAL_CAPTION_SYSTEM = `Bạn là social media editor cho podcast tiếng Việt "ByteCast Tech" — kênh khám phá triết học, tâm lý học, AI, xã hội. Style: chiêm nghiệm, sâu sắc, mộc mạc.

Nhiệm vụ: Tạo caption + hashtags cho Facebook Reels theo BEST PRACTICE FB 2025.

YÊU CẦU CAPTION (TIẾNG VIỆT) — theo FB Reels mobile recommendation:
- TỔNG 3-4 dòng. FB mobile chỉ hiện ~125 ký tự đầu trước khi user bấm "Xem thêm" → 2 dòng đầu phải MẠNH nhất.
- **DÒNG 1 = ĐÚNG video title** được cho (hoặc paraphrase rất gần). Title là cái user thấy đầu tiên trên feed mobile — KHÔNG để mất.
- Dòng 2 = HOOK punchy (1 câu hỏi/nghịch lý gây dừng scroll). Cộng dòng 1 + 2 ≤ 125 ký tự (KHÔNG kể line break).
- Dòng 3-4 = tease nội dung + soft CTA ("Xem clip để hiểu thêm" / "Nghe đến cuối nhé"). Phần này sẽ bị fold vào "Xem thêm".
- 1 emoji DUY NHẤT (FB ranking ưu tiên minimal emoji). KHÔNG tràn emoji.
- KHÔNG dùng cụm sáo rỗng: "không thể phủ nhận", "trong cuộc sống hối hả", "thời đại 4.0".
- KHÔNG nhúng hashtag trong caption — hashtag để mảng riêng.

YÊU CẦU HASHTAGS — theo FB Reels recommendation:
- ĐÚNG 3-5 hashtag (KHÔNG quá 5 — FB ranking penalize hashtag stuffing).
- Chọn relevant nhất, không general spam.
- 1 hashtag brand: bytecast HOẶC bytecasttech (chọn 1, không cả 2).
- 2-3 hashtag chủ đề cụ thể của episode (vd: trietoc, tamlyhoc, suyngam, chodi, vita).
- 0-1 hashtag tiếng Anh phổ biến nếu chủ đề universal (philosophy, mindfulness).
- Tất cả lowercase, không dấu, không space.

OUTPUT JSON (đúng schema):
{
  "caption": "string — caption hoàn chỉnh 2-3 dòng, có line breaks \\n",
  "hashtags": ["string", ...]  // 3-5 phần tử, KHÔNG có dấu #, KHÔNG space
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
