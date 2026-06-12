import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { VisualPlan, VisualScene } from "../src/visualPlan";

dotenv.config();

const IMAGES_DIR = path.resolve("assets/images-cache");
const OPENAI_URL = "https://api.openai.com/v1/images/generations";

const DEFAULT_MODEL = process.env.IMAGE_MODEL ?? "gpt-image-1";
const DEFAULT_SIZE = process.env.IMAGE_SIZE ?? "1024x1536"; // 2:3 ~ 9:16
const DEFAULT_QUALITY = process.env.IMAGE_QUALITY ?? "medium";
const CONCURRENCY = Number(process.env.IMAGE_CONCURRENCY ?? "3");

const ensureDir = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

const imagePath = (hash: string): string => path.join(IMAGES_DIR, `${hash}.png`);

type GenOptions = {
  limit?: number;
  force?: boolean;
};

const callOpenAI = async (
  prompt: string,
  apiKey: string,
): Promise<Buffer> => {
  const body = {
    model: DEFAULT_MODEL,
    prompt,
    n: 1,
    size: DEFAULT_SIZE,
    quality: DEFAULT_QUALITY,
  };
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    data: Array<{ b64_json?: string; url?: string }>;
  };
  const first = json.data[0];
  if (!first) throw new Error("OpenAI response empty data array");
  if (first.b64_json) {
    return Buffer.from(first.b64_json, "base64");
  }
  if (first.url) {
    const imgRes = await fetch(first.url);
    if (!imgRes.ok) throw new Error(`fetch image url ${imgRes.status}`);
    return Buffer.from(await imgRes.arrayBuffer());
  }
  throw new Error("OpenAI response missing b64_json + url");
};

async function processScene(
  scene: VisualScene,
  apiKey: string,
  force: boolean,
): Promise<{ scene: VisualScene; status: "cached" | "generated" | "error"; err?: string }> {
  const out = imagePath(scene.imageHash);
  if (fs.existsSync(out) && !force) {
    return { scene, status: "cached" };
  }
  try {
    const buf = await callOpenAI(scene.visualPrompt, apiKey);
    fs.writeFileSync(out, buf);
    return { scene, status: "generated" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { scene, status: "error", err: msg };
  }
}

export async function generateImages(
  plan: VisualPlan,
  { limit, force = false }: GenOptions = {},
): Promise<{ generated: number; cached: number; errors: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[gen-images] Thiếu OPENAI_API_KEY. Set trong .env hoặc shell rồi chạy lại.",
    );
  }
  ensureDir(IMAGES_DIR);

  const scenes = limit ? plan.scenes.slice(0, limit) : plan.scenes;
  const toGenerate = scenes.filter(
    (s) => force || !fs.existsSync(imagePath(s.imageHash)),
  );
  const cachedCount = scenes.length - toGenerate.length;

  console.log(
    `[gen-images] model=${DEFAULT_MODEL} size=${DEFAULT_SIZE} quality=${DEFAULT_QUALITY}`,
  );
  console.log(
    `[gen-images] ${scenes.length} scenes — cached: ${cachedCount}, cần generate: ${toGenerate.length}`,
  );
  if (toGenerate.length === 0) {
    return { generated: 0, cached: cachedCount, errors: 0 };
  }
  const estCost =
    toGenerate.length *
    (DEFAULT_QUALITY === "high" ? 0.17 : DEFAULT_QUALITY === "medium" ? 0.04 : 0.011);
  console.log(`[gen-images] ước tính chi phí: ~$${estCost.toFixed(2)} USD`);

  let generated = 0;
  let errors = 0;
  let inFlight = 0;
  let nextIdx = 0;

  return new Promise((resolve, reject) => {
    const tick = () => {
      while (inFlight < CONCURRENCY && nextIdx < toGenerate.length) {
        const scene = toGenerate[nextIdx]!;
        nextIdx++;
        inFlight++;
        const label = `#${String(scene.index).padStart(2, "0")} (${scene.imageHash.slice(0, 8)})`;
        console.log(`  [gen] ${label} → starting...`);
        processScene(scene, apiKey, force)
          .then((r) => {
            inFlight--;
            if (r.status === "generated") {
              generated++;
              console.log(`  ✓ ${label}`);
            } else if (r.status === "error") {
              errors++;
              console.error(`  ✗ ${label}: ${r.err}`);
            }
            if (nextIdx >= toGenerate.length && inFlight === 0) {
              resolve({ generated, cached: cachedCount, errors });
            } else {
              tick();
            }
          })
          .catch((e) => {
            inFlight--;
            errors++;
            console.error(`  ✗ ${label}: ${e}`);
            if (nextIdx >= toGenerate.length && inFlight === 0) {
              resolve({ generated, cached: cachedCount, errors });
            } else {
              tick();
            }
          });
      }
      if (toGenerate.length === 0) resolve({ generated, cached: cachedCount, errors });
    };
    try {
      tick();
    } catch (e) {
      reject(e);
    }
  });
}

const isMain = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  const planArg = process.argv[2];
  if (!planArg) {
    console.error(
      "Usage: tsx scripts/gen-images.ts <plan.json> [--limit N] [--force]",
    );
    process.exit(1);
  }
  const planPath = path.resolve(planArg);
  if (!fs.existsSync(planPath)) {
    console.error(`Plan không tồn tại: ${planPath}`);
    process.exit(1);
  }
  const plan = JSON.parse(fs.readFileSync(planPath, "utf-8")) as VisualPlan;
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : undefined;
  const force = process.argv.includes("--force");

  generateImages(plan, { limit, force })
    .then((r) =>
      console.log(`[gen-images] done — generated:${r.generated} cached:${r.cached} errors:${r.errors}`),
    )
    .catch((e: unknown) => {
      console.error("[gen-images] FAIL:", e);
      process.exit(1);
    });
}
