import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Tiền xử lý footage cho FootageLayer (#5) — biến clip thô thành b-roll kiểu
 * Pexels để dùng làm NỀN đã xử lý dưới lớp đồ hoạ gốc.
 *
 * Mỗi clip: BỎ ÂM THANH GỐC + làm CHẬM (mặc định 0.7×) + chuẩn hoá về
 * 1080×1920 (scale cover + crop giữa) + cắt nhẹ đầu clip cho hết rung máy.
 * KHÔNG grade/blur/tint ở đây — để dành cho FootageLayer (blur + tối + phủ
 * màu thương hiệu lúc render), giữ file gốc "sạch" để tái dùng linh hoạt.
 *
 * Dùng:
 *   npx tsx podcast/scripts/prep-footage.ts [--speed 0.7] [--out input/footage] <file...>
 *
 * Lưu ý originality (Meta): footage TỰ QUAY (kể cả đời thường/gia đình) là tín
 * hiệu "filmed by you" mạnh nhất — tốt hơn stock. Xem docs/originality-upgrade-plan.md §3.2.
 */

const W = 1080;
const H = 1920;
const HEAD_TRIM_S = 0.2; // bỏ 0.2s đầu (rung máy khi bấm quay)

const sanitize = (name: string): string =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32)
    .toLowerCase();

const probe = (file: string): { w: number; h: number; dur: number } | null => {
  try {
    const out = execFileSync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height:format=duration",
        "-of", "default=nw=1:nk=1",
        file,
      ],
      { encoding: "utf-8" },
    ).trim().split("\n");
    const w = Number(out[0]);
    const h = Number(out[1]);
    const dur = Number(out[2]);
    if (!w || !h) return null;
    return { w, h, dur: dur || 0 };
  } catch {
    return null;
  }
};

const prepOne = (src: string, outDir: string, speed: number): void => {
  const info = probe(src);
  if (!info) {
    console.warn(`[prep-footage] ✗ bỏ qua (không đọc được): ${src}`);
    return;
  }
  const base = sanitize(path.basename(src));
  const out = path.join(outDir, `${base}.mp4`);
  // setpts=PTS/speed → speed<1 làm chậm lại; -r 30 tái tạo frame cho mượt.
  const vf = [
    `setpts=PTS/${speed}`,
    `scale=${W}:${H}:force_original_aspect_ratio=increase`,
    `crop=${W}:${H}`,
  ].join(",");

  execFileSync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", String(HEAD_TRIM_S),
      "-i", src,
      // BỎ tiếng gốc nhưng THÊM track im lặng: Remotion OffthreadVideo probe
      // audio mọi asset — video KHÔNG có audio track dễ gây lỗi proxy/moov khi
      // render full. Track im lặng (aac) làm pipeline audio của Remotion "sạch".
      "-f", "lavfi",
      "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-shortest",
      "-vf", vf,
      "-r", "30",
      "-c:v", "libx264",
      "-crf", "23",
      "-preset", "medium",
      // Keyframe mỗi 1s → Remotion seek frame footage ổn định.
      "-g", "30",
      "-keyint_min", "30",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "16k",
      "-movflags", "+faststart",
      out,
    ],
    { stdio: "inherit" },
  );

  const o = probe(out);
  const inDur = info.dur.toFixed(0);
  const outDur = o ? o.dur.toFixed(0) : "?";
  const sizeMb = (fs.statSync(out).size / 1e6).toFixed(1);
  console.log(
    `[prep-footage] ✓ ${base}.mp4  (${info.w}x${info.h} ${inDur}s → ${W}x${H} ${outDur}s, ${sizeMb}MB)`,
  );
};

const main = (): void => {
  const argv = process.argv.slice(2);
  let speed = 0.7;
  let outDir = path.resolve("input/footage");
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--speed") speed = Number(argv[++i]);
    else if (a === "--out") outDir = path.resolve(argv[++i]);
    else files.push(a);
  }
  if (files.length === 0) {
    console.error(
      "Usage: npx tsx podcast/scripts/prep-footage.ts [--speed 0.7] [--out dir] <file...>",
    );
    process.exit(1);
  }
  if (speed <= 0 || speed > 1.5) {
    console.error(`[prep-footage] speed không hợp lệ: ${speed}`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  console.log(
    `[prep-footage] ${files.length} clip → ${outDir}  (speed ${speed}×, bỏ tiếng, ${W}×${H})`,
  );
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.warn(`[prep-footage] ✗ không tồn tại: ${f}`);
      continue;
    }
    prepOne(f, outDir, speed);
  }
  console.log(`[prep-footage] xong.`);
};

main();
