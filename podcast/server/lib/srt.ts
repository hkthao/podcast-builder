/**
 * Phụ đề SRT cho video đã render (đăng FB kèm CC): từ tmp/<slug>.corrected.json,
 * dời theo phần mở đầu chỉ-nhạc (intro + hook) để khớp đúng video. Câu dài chia
 * thành nhiều cue ≤ MAX_CHARS, thời gian chia theo số ký tự.
 */
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../../shared/studio-core/paths";
import { speechLeadFrames, type EpisodeConfig } from "../../src/episode";
import { FPS } from "../../src/theme";

const MAX_CHARS = 84;
/** Giới hạn file captions của Graph API. */
const MAX_BYTES = 200 * 1024;

const ts = (ms: number) => {
  const v = Math.max(0, Math.round(ms));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(v / 3_600_000))}:${p(Math.floor((v % 3_600_000) / 60_000))}:${p(Math.floor((v % 60_000) / 1000))},${p(v % 1000, 3)}`;
};

/** Chia câu thành n phần DÀI ĐỀU (n = ceil(độ dài / MAX_CHARS)) — tránh cue mồ côi 1 chữ. */
const splitText = (text: string): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const n = Math.max(1, Math.ceil(text.length / MAX_CHARS));
  const target = text.length / n;
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && out.length < n - 1 && (cur + " " + w).length > target) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
};

/** null nếu chưa có transcript. */
export function buildEpisodeSrt(name: string, config: EpisodeConfig): string | null {
  const tp = [`${name}.corrected.json`, `${name}.json`].map((f) => path.join(PATHS.TMP_DIR, f)).find((p) => fs.existsSync(p));
  if (!tp) return null;
  const segs = (
    JSON.parse(fs.readFileSync(tp, "utf-8")) as { transcription: Array<{ text: string; offsets: { from: number; to: number } }> }
  ).transcription.filter((s) => s.text.trim());
  const lead = (speechLeadFrames(config, FPS) / FPS) * 1000;
  const cues: string[] = [];
  for (const s of segs) {
    const parts = splitText(s.text.trim());
    const total = parts.reduce((n, p) => n + p.length, 0) || 1;
    let t = s.offsets.from;
    for (const part of parts) {
      const dur = ((s.offsets.to - s.offsets.from) * part.length) / total;
      cues.push(`${cues.length + 1}\n${ts(lead + t)} --> ${ts(lead + t + Math.max(dur, 400))}\n${part}\n`);
      t += dur;
    }
  }
  const srt = cues.join("\n");
  return Buffer.byteLength(srt) <= MAX_BYTES ? srt : null;
}
