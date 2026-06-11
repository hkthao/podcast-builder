import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bundle,
  type BundleOptions,
} from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import {
  buildEpisodeTemplate,
  EpisodeConfigSchema,
  type EpisodeConfig,
} from "../src/episode";
import { processAudio } from "./process-audio";
import { transcribeAudio } from "./transcribe";
import { getModel } from "./whisper-config";

const PUBLIC_DIR = path.resolve("public");
const OUTPUT_DIR = path.resolve("output");
const TMP_DIR = path.resolve("tmp");
const THEME_PATH = path.resolve("src/theme.ts");

const COMPOSITION_ID = "Podcast";

type Args = {
  audioPath: string;
  preview: boolean;
  noThumb: boolean;
};

const parseArgs = (argv: string[]): Args => {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const audio = positional[0];
  if (!audio) {
    console.error("Usage: tsx scripts/make.ts <audio> [--preview] [--no-thumb]");
    process.exit(1);
  }
  return {
    audioPath: path.resolve(audio),
    preview: flags.has("--preview"),
    noThumb: flags.has("--no-thumb"),
  };
};

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

const sha256File = (p: string): string => {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
};

const sha256Object = (obj: unknown): string => {
  const h = crypto.createHash("sha256");
  h.update(JSON.stringify(obj));
  return h.digest("hex");
};

const loadOrTemplate = (audioPath: string): EpisodeConfig => {
  const base = path.basename(audioPath).replace(/\.[^.]+$/, "");
  const jsonPath = path.join(path.dirname(audioPath), `${base}.json`);
  if (!fs.existsSync(jsonPath)) {
    const template = buildEpisodeTemplate(base);
    fs.writeFileSync(jsonPath, JSON.stringify(template, null, 2));
    console.error(
      `\n[make] Chưa có episode config — đã tạo template:\n  ${jsonPath}\nHãy điền 'title' + 'hook' rồi chạy lại.\n`,
    );
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const parsed = EpisodeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`[make] Episode config lỗi schema (${jsonPath}):`);
    console.error(parsed.error.format());
    process.exit(1);
  }
  return parsed.data;
};

const copyToPublic = (src: string, name: string): string => {
  ensureDir(PUBLIC_DIR);
  const dst = path.join(PUBLIC_DIR, name);
  fs.copyFileSync(src, dst);
  return name;
};

const cleanupPublic = (names: string[]) => {
  for (const n of names) {
    const p = path.join(PUBLIC_DIR, n);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const t0 = Date.now();

  if (!fs.existsSync(args.audioPath)) {
    throw new Error(`File audio không tồn tại: ${args.audioPath}`);
  }
  const baseName = path.basename(args.audioPath).replace(/\.[^.]+$/, "");
  ensureDir(OUTPUT_DIR);
  ensureDir(TMP_DIR);

  console.log(`\n[make] ===== ${baseName} ${args.preview ? "(PREVIEW)" : ""} =====`);

  // 1. Load episode config
  const episode = loadOrTemplate(args.audioPath);
  console.log(`[make] episode: "${episode.title}" #${episode.episodeNumber}`);

  // 2. Process audio (loudness normalize)
  const { whisperWav, renderWav } = await processAudio(args.audioPath);

  // 3. Transcribe (cache-aware)
  const transcriptJson = path.join(TMP_DIR, `${baseName}.json`);
  await transcribeAudio(whisperWav, transcriptJson);

  // 4. Copy assets vào public/ cho Remotion staticFile()
  const audioPublicName = `${baseName}.audio.wav`;
  const transcriptPublicName = `${baseName}.transcript.json`;
  copyToPublic(renderWav, audioPublicName);
  copyToPublic(transcriptJson, transcriptPublicName);
  const cleanupList = [audioPublicName, transcriptPublicName];

  let bgmPublicName: string | null = null;
  if (episode.bgm) {
    const bgmAbsPath = path.resolve(path.dirname(args.audioPath), episode.bgm);
    if (!fs.existsSync(bgmAbsPath)) {
      throw new Error(`BGM không tồn tại: ${bgmAbsPath}`);
    }
    bgmPublicName = `${baseName}.bgm${path.extname(episode.bgm)}`;
    copyToPublic(bgmAbsPath, bgmPublicName);
    cleanupList.push(bgmPublicName);
  }

  // 5. Build props
  const inputProps = {
    audioSrc: audioPublicName,
    transcriptSrc: transcriptPublicName,
    bgmSrc: bgmPublicName,
    episode,
  };

  try {
    // 6. Bundle Remotion project (1 lần / run)
    console.log(`[make] bundling Remotion project...`);
    const bundleOptions: BundleOptions = {
      entryPoint: path.resolve("src/index.ts"),
      publicDir: PUBLIC_DIR,
    };
    const serveUrl = await bundle(bundleOptions);

    // 7. Select composition (resolve duration qua calculateMetadata)
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
    });
    console.log(
      `[make] composition: ${composition.width}×${composition.height}, ` +
        `${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(2)}s)`,
    );

    // 8. Render
    const outputPath = path.join(
      OUTPUT_DIR,
      args.preview ? `${baseName}.preview.mp4` : `${baseName}.mp4`,
    );

    if (args.preview) {
      const previewFrames = Math.min(
        composition.durationInFrames,
        composition.fps * 10,
      );
      await renderMedia({
        serveUrl,
        composition: {
          ...composition,
          durationInFrames: previewFrames,
          width: 480,
          height: 854,
        },
        codec: "h264",
        outputLocation: outputPath,
        inputProps,
        videoBitrate: "1500K",
        audioBitrate: "128K",
        audioCodec: "aac",
      });
    } else {
      await renderMedia({
        serveUrl,
        composition,
        codec: "h264",
        outputLocation: outputPath,
        inputProps,
        videoBitrate: "8000K",
        audioBitrate: "192K",
        audioCodec: "aac",
      });
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[make] ✓ ${outputPath} (${elapsed}s)`);

    // 9. Thumbnail (skip preview hoặc --no-thumb)
    if (!args.preview && !args.noThumb) {
      const thumbPath = path.join(OUTPUT_DIR, `${baseName}.thumb.jpg`);
      const thumbFrame = Math.min(
        composition.durationInFrames - 1,
        Math.round(composition.fps * 4.5),
      );
      await renderStill({
        serveUrl,
        composition,
        output: thumbPath,
        inputProps,
        frame: thumbFrame,
        imageFormat: "jpeg",
        jpegQuality: 85,
      });
      console.log(`[make] ✓ ${thumbPath}`);
    }

    // 10. Lock file
    if (!args.preview) {
      const lockPath = path.join(OUTPUT_DIR, `${baseName}.lock.json`);
      const lock = {
        renderedAt: new Date().toISOString(),
        themeHash: `sha256:${sha256File(THEME_PATH)}`,
        episodeHash: `sha256:${sha256Object(episode)}`,
        audioHash: `sha256:${sha256File(args.audioPath)}`,
        whisperModel: getModel(),
      };
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
      console.log(`[make] ✓ ${lockPath}`);
    }
  } finally {
    // 11. Cleanup public/ — giữ brand/
    cleanupPublic(cleanupList);
  }
}

const isMain = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((e: unknown) => {
    console.error("[make] FAIL:", e);
    process.exit(1);
  });
}
