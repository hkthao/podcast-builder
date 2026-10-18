import "dotenv/config";
/**
 * audio-qc.ts — Gemini NGHE audio của tập và chấm giọng vùng miền (Bắc/Nam) theo
 * từng đoạn — thay bước user nghe tay (máy/whisper không bắt được accent).
 * Dùng trong chạy tự động (skill plan-week): fail → gen lại audio.
 *
 * Usage: npx tsx story/scripts/audio-qc.ts <slug | path/to/audio> [--podcast] [--model=...]
 *   --podcast: podcast 2 host (NotebookLM, ByteCast) → kiểm thêm XƯNG HÔ: host nam xưng "Tôi"
 *   gọi nữ "Chị", host nữ xưng "Tôi" gọi nam "Anh" (NotebookLM hay ĐẢO — memory podcast-xung-ho).
 * In JSON {pass, accent, southernSegments, addressing?, issues} + exit 0 (pass) / 2 (fail).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getApiKey } from "../../shared/studio-core/api-keys-store";

// Alias tự trỏ bản flash mới nhất (gemini-2.5-flash đã ngừng cấp cho tài khoản mới).
const MODEL_DEFAULT = "gemini-flash-latest";

const PROMPT = `Bạn là chuyên gia ngữ âm tiếng Việt. Nghe TOÀN BỘ đoạn audio (người đọc kể chuyện / podcast tiếng Việt) và đánh giá GIỌNG VÙNG MIỀN.
Yêu cầu của kênh: giọng Bắc chuẩn Hà Nội, NHẤT QUÁN từ đầu đến cuối.
Dấu hiệu giọng Nam: không phân biệt dấu hỏi/ngã (đọc ngã thành hỏi), "v" đọc gần "d/j", "-n/-ng" và "-t/-c" cuối lẫn nhau, "tr/ch" uốn lưỡi rõ, ngữ điệu Nam bộ.
Chia audio thành các đoạn liên tiếp (mỗi đoạn ~30-60 giây hoặc theo chỗ đổi giọng) và chấm từng đoạn.
CHỈ trả về JSON:
{"overall":"bac"|"nam"|"lan","segments":[{"from":"mm:ss","to":"mm:ss","accent":"bac"|"nam"|"khong_ro","note":"dấu hiệu nghe được, ngắn"}],"other_issues":["vấp/lặp/đọc sai/tiếng ồn… nếu có, kèm mm:ss"]}`;

const PODCAST_EXTRA = `
ĐÂY LÀ PODCAST 2 HOST (1 nam, 1 nữ). Kiểm thêm XƯNG HÔ giữa 2 host. Đúng: host NAM gọi host nữ là "Chị" (hoặc tên), xưng "Tôi"; host NỮ gọi host nam là "Anh", xưng "Tôi". SAI (đảo): host nam gọi người kia là "Anh" HOẶC host nữ gọi người kia là "Chị". Cả hai cùng gọi khán giả "các anh các chị" là ĐÚNG, không tính.
Thêm vào JSON trường: "addressing":{"ok":true|false,"reversed_examples":[{"at":"mm:ss","speaker":"nam"|"nu","said":"câu nghe được"}]}`;

async function main() {
  const arg = process.argv[2];
  const model = process.argv.find((a) => a.startsWith("--model="))?.split("=")[1] ?? MODEL_DEFAULT;
  const podcast = process.argv.includes("--podcast");
  if (!arg) {
    console.error("Usage: npx tsx story/scripts/audio-qc.ts <slug | audio-path>");
    process.exit(1);
  }
  const audio = fs.existsSync(arg) ? arg : path.resolve("input", `${arg}.m4a`);
  if (!fs.existsSync(audio)) throw new Error(`Không thấy audio: ${audio}`);
  const key = getApiKey("gemini");
  if (!key) throw new Error("Chưa có Gemini API key (Settings)");

  // Mono 16k mp3 cho nhẹ (inline ≤ 20MB; 15' ≈ 3.6MB).
  const tmp = path.resolve("tmp", `qc-${path.basename(audio).replace(/\.[^.]+$/, "")}.mp3`);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", audio, "-ac", "1", "-ar", "16000", "-b:a", "32k", tmp]);
  const data = fs.readFileSync(tmp).toString("base64");
  fs.rmSync(tmp);

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/mpeg", data } }, { text: PROMPT + (podcast ? PODCAST_EXTRA : "") }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const r = JSON.parse(text) as {
    overall: string;
    segments: Array<{ from: string; to: string; accent: string; note: string }>;
    other_issues?: string[];
    addressing?: { ok: boolean; reversed_examples?: Array<{ at: string; speaker: string; said: string }> };
  };
  const southern = r.segments.filter((s) => s.accent === "nam");
  const addressingOk = !podcast || r.addressing?.ok !== false;
  const pass = r.overall === "bac" && southern.length === 0 && addressingOk;
  console.log(
    JSON.stringify(
      {
        pass,
        accent: r.overall,
        southernSegments: southern,
        ...(podcast ? { addressing: r.addressing ?? null } : {}),
        issues: r.other_issues ?? [],
        segments: r.segments,
        model,
      },
      null,
      2,
    ),
  );
  process.exit(pass ? 0 : 2);
}

main().catch((e: unknown) => {
  console.error("[audio-qc] FAIL:", e);
  process.exit(1);
});
