import path from "node:path";

export const WHISPER_CPP_VERSION = "1.5.5";
export const WHISPER_PATH = path.resolve("whisper.cpp");

const VALID_MODELS = [
  "tiny",
  "base",
  "small",
  "medium",
  "large-v1",
  "large-v2",
  "large-v3",
  "large-v3-turbo",
] as const;

export type WhisperModel = (typeof VALID_MODELS)[number];

const isValidModel = (m: string): m is WhisperModel =>
  (VALID_MODELS as readonly string[]).includes(m);

export const getModel = (): WhisperModel => {
  const m = process.env.WHISPER_MODEL ?? "medium";
  if (!isValidModel(m)) {
    throw new Error(
      `WHISPER_MODEL không hợp lệ: ${m}. Hợp lệ: ${VALID_MODELS.join(", ")}`,
    );
  }
  return m;
};
