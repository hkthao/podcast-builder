/**
 * Forced-align: MƯỢN timing của whisper, GIỮ NGUYÊN chữ kịch bản chuẩn.
 * Neo bằng LCS giữa (chữ whisper bỏ dấu) và (chữ kịch bản bỏ dấu); từ không neo
 * được nội suy tuyến tính giữa 2 mốc. Cùng thuật toán reel/scripts/reel-align.ts
 * (reel giữ bản riêng để cô lập khỏi studio).
 */
import type { Transcript } from "../transcribe/transcribe";

/** Bỏ dấu tiếng Việt + hạ chữ thường + chỉ giữ [a-z0-9] để so khớp thô. */
export const normWord = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export type ScriptWord = { raw: string; norm: string; sentence: number };
export type TimedWord = { norm: string; startMs: number; endMs: number };
export type AlignedWord = ScriptWord & { startMs: number; endMs: number };

/** Danh sách câu → từ (token toàn dấu câu bị bỏ khỏi danh sách căn). */
export const sentencesToWords = (sentences: string[]): ScriptWord[] => {
  const words: ScriptWord[] = [];
  sentences.forEach((sentence, si) => {
    for (const tok of sentence.split(/\s+/)) {
      const norm = normWord(tok);
      if (norm) words.push({ raw: tok, norm, sentence: si });
    }
  });
  return words;
};

/**
 * Whisper cắt âm tiết tiếng Việt thành nhiều token ("gi"+"ữ", "đ"+"ồ"), có khi vắt qua
 * 2 segment → ghép token KHÔNG mở đầu bằng khoảng trắng vào từ trước rồi mới chuẩn hoá.
 */
export const whisperWords = (t: Transcript): TimedWord[] => {
  const raw: Array<{ text: string; startMs: number; endMs: number }> = [];
  const push = (text: string, startMs: number, endMs: number) => {
    if (/^\[_.*_\]$/.test(text.trim())) return; // [_BEG_], [_TT_…]
    const last = raw[raw.length - 1];
    if (last && !/^\s/.test(text)) {
      last.text += text;
      last.endMs = endMs;
    } else {
      raw.push({ text, startMs, endMs });
    }
  };
  for (const seg of t.transcription) {
    if (seg.tokens?.length) {
      for (const tok of seg.tokens) push(tok.text, tok.offsets.from, tok.offsets.to);
    } else if (seg.text.trim()) {
      push(seg.text, seg.offsets.from, seg.offsets.to);
    }
  }
  return raw.flatMap((w) => {
    const norm = normWord(w.text);
    return norm ? [{ norm, startMs: w.startMs, endMs: w.endMs }] : [];
  });
};

/** LCS → cặp anchor (chỉ số W, chỉ số S) tăng dần. */
export const lcsAnchors = (W: TimedWord[], S: ScriptWord[]): Array<[number, number]> => {
  const n = W.length;
  const m = S.length;
  const dp = new Uint32Array((n + 1) * (m + 1));
  const idx = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[idx(i, j)] =
        W[i].norm === S[j].norm
          ? dp[idx(i + 1, j + 1)] + 1
          : Math.max(dp[idx(i + 1, j)], dp[idx(i, j + 1)]);
    }
  }
  const anchors: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (W[i].norm === S[j].norm) {
      anchors.push([i, j]);
      i++;
      j++;
    } else if (dp[idx(i + 1, j)] >= dp[idx(i, j + 1)]) {
      i++;
    } else {
      j++;
    }
  }
  return anchors;
};

/** Gán start/end cho MỌI từ kịch bản. Trả kèm số từ neo được. */
export const alignWords = (
  W: TimedWord[],
  S: ScriptWord[],
  durationMs: number,
): { aligned: AlignedWord[]; anchored: number } => {
  const aligned: AlignedWord[] = S.map((w) => ({ ...w, startMs: -1, endMs: -1 }));
  const anchors = lcsAnchors(W, S);
  for (const [wi, sj] of anchors) {
    aligned[sj].startMs = W[wi].startMs;
    aligned[sj].endMs = W[wi].endMs;
  }
  let k = 0;
  while (k < aligned.length) {
    if (aligned[k].startMs !== -1) {
      k++;
      continue;
    }
    let end = k;
    while (end < aligned.length && aligned[end].startMs === -1) end++;
    const prevEnd = k > 0 ? aligned[k - 1].endMs : 0;
    const nextStart = end < aligned.length ? aligned[end].startMs : durationMs;
    const step = (end - k) > 0 ? Math.max(0, nextStart - prevEnd) / (end - k) : 0;
    for (let g = 0; g < end - k; g++) {
      aligned[k + g].startMs = prevEnd + step * g;
      aligned[k + g].endMs = prevEnd + step * (g + 1);
    }
    k = end;
  }
  // đơn điệu hoá: token whisper đôi lúc chồng lấn
  let last = 0;
  for (const w of aligned) {
    if (w.startMs < last) w.startMs = last;
    if (w.endMs < w.startMs) w.endMs = w.startMs;
    last = w.endMs;
  }
  return { aligned, anchored: anchors.length };
};

/** Mốc [start, end] (ms) của từng câu từ các từ đã căn. Câu không có từ → nối liền câu trước. */
export const sentenceSpans = (
  aligned: AlignedWord[],
  sentenceCount: number,
): Array<{ startMs: number; endMs: number }> => {
  const spans = Array.from({ length: sentenceCount }, () => ({ startMs: -1, endMs: -1 }));
  for (const w of aligned) {
    const s = spans[w.sentence];
    if (s.startMs === -1) s.startMs = w.startMs;
    s.endMs = w.endMs;
  }
  spans.forEach((s, i) => {
    if (s.startMs === -1) {
      s.startMs = i > 0 ? spans[i - 1].endMs : 0;
      s.endMs = s.startMs;
    }
  });
  return spans.map((s) => ({ startMs: Math.round(s.startMs), endMs: Math.round(s.endMs) }));
};
