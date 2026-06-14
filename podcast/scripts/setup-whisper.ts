import {
  downloadWhisperModel,
  installWhisperCpp,
} from "@remotion/install-whisper-cpp";
import { WHISPER_CPP_VERSION, WHISPER_PATH, getModel } from "../../shared/transcribe/whisper-config";

async function main() {
  const model = getModel();
  console.log(`[setup-whisper] whisper.cpp ${WHISPER_CPP_VERSION} → ${WHISPER_PATH}`);
  const install = await installWhisperCpp({
    to: WHISPER_PATH,
    version: WHISPER_CPP_VERSION,
    printOutput: true,
  });
  console.log(install.alreadyExisted ? "  [cache] đã có sẵn" : "  ✓ cài xong");

  console.log(`[setup-whisper] Tải model ${model}...`);
  const dl = await downloadWhisperModel({
    folder: WHISPER_PATH,
    model,
    printOutput: true,
  });
  console.log(dl.alreadyExisted ? "  [cache] đã có sẵn" : "  ✓ tải xong");

  console.log("[setup-whisper] Done.");
}

main().catch((e: unknown) => {
  console.error("[setup-whisper] FAIL:", e);
  process.exit(1);
});
