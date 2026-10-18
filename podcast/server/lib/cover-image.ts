/**
 * Tạo ảnh cover từ prompt cover đã có (coverPrompt / coverPromptLandscape).
 * TỐN PHÍ — chỉ chạy khi user bấm nút trên UI. Key lấy từ trang Settings.
 *
 * Mặc định dùng model RẺ NHẤT (user chọn 2026-10-18); đổi qua env khi cần đẹp hơn.
 * - gemini: env GEMINI_IMAGE_MODEL (mặc định gemini-3.1-flash-lite-image; đẹp/chữ
 *   chuẩn hơn: gemini-3-pro-image). Ra ĐÚNG khung 9:16 / 16:9.
 * - openai: env OPENAI_IMAGE_MODEL (mặc định gpt-image-1-mini, quality medium). Khung gần nhất dọc
 *   1024×1536 (2:3), ngang 1536×1024 (3:2) — IntroCard/thumbnail tự crop.
 */
import OpenAI from "openai";
import { getApiKey } from "../../../shared/studio-core/api-keys-store";
import type { CoverVariant } from "./episode-store";

export type CoverImageProvider = "gemini" | "openai";

export const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-lite-image";
export const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1-mini";

export type GeneratedImage = { data: Buffer; ext: "png" | "jpg" | "webp" };

async function generateWithGemini(prompt: string, variant: CoverVariant): Promise<GeneratedImage> {
  const apiKey = getApiKey("gemini");
  if (!apiKey) throw new Error("Chưa có Gemini API key — nhập ở Settings.");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: variant === "landscape" ? "16:9" : "9:16" },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> };
    }>;
  };
  const cand = json.candidates?.[0];
  const inline = cand?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!inline) {
    throw new Error(`Gemini không trả ảnh (finishReason: ${cand?.finishReason ?? "?"}).`);
  }
  const ext = inline.mimeType.includes("jpeg") ? "jpg" : inline.mimeType.includes("webp") ? "webp" : "png";
  return { data: Buffer.from(inline.data, "base64"), ext };
}

async function generateWithOpenAI(prompt: string, variant: CoverVariant): Promise<GeneratedImage> {
  const apiKey = getApiKey("openai");
  if (!apiKey) throw new Error("Chưa có OpenAI API key — nhập ở Settings.");
  const openai = new OpenAI({ apiKey });
  const res = await openai.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt,
    size: variant === "landscape" ? "1536x1024" : "1024x1536",
    quality: "medium",
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI không trả ảnh (thiếu b64_json).");
  return { data: Buffer.from(b64, "base64"), ext: "png" };
}

export function generateCoverImage(
  provider: CoverImageProvider,
  prompt: string,
  variant: CoverVariant,
): Promise<GeneratedImage> {
  return provider === "openai"
    ? generateWithOpenAI(prompt, variant)
    : generateWithGemini(prompt, variant);
}
