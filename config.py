from pathlib import Path

ROOT = Path(__file__).resolve().parent

SAMPLES_DIR = ROOT / "samples"
SPEAKERS = {
    "[NAM]": "male.wav",
    "[NỮ]": "female.wav",
}

OUTPUT_DIR = ROOT / "output"
CHUNKS_DIR = OUTPUT_DIR / "chunks"
MODELS_DIR = ROOT / "models"

SCRIPT_PATH = ROOT / "script.txt"
PODCAST_PATH = OUTPUT_DIR / "podcast.mp3"

SILENCE_MS = 400
TARGET_DBFS = -20.0
OUTPUT_BITRATE = "192k"

MODEL_NAME = "capleaf/viXTTS"
LANGUAGE = "vi"

SPEAKER_SLUGS = {
    "[NAM]": "nam",
    "[NỮ]": "nu",
}
