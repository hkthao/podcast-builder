from pathlib import Path

ROOT = Path(__file__).resolve().parent

SAMPLES_DIR = ROOT / "samples"

# Each speaker maps to (wav file, ref_text file). The .txt is the literal
# transcript of the corresponding .wav — OmniVoice uses it for voice cloning.
SPEAKERS = {
    "[NAM]": ("male.wav", "male.txt"),
    "[NỮ]": ("female.wav", "female.txt"),
}

OUTPUT_DIR = ROOT / "output"
CHUNKS_DIR = OUTPUT_DIR / "chunks"
MODELS_DIR = ROOT / "models"

SCRIPT_PATH = ROOT / "script.txt"
PODCAST_PATH = OUTPUT_DIR / "podcast.mp3"

SILENCE_MS = 400
TARGET_DBFS = -20.0
OUTPUT_BITRATE = "192k"

# k2-fsa/OmniVoice — Apache-2.0, zero-shot voice cloning, 600+ languages
# (Vietnamese included). Replaces viXTTS, which struggled with Vietnamese
# tones and was CPML-licensed (non-commercial).
MODEL_NAME = "k2-fsa/OmniVoice"
LANGUAGE = "vi"

# OmniVoice generation knobs. Defaults mirror omnivoice-infer CLI.
NUM_STEP = 32
GUIDANCE_SCALE = 2.0
T_SHIFT = 0.1
DENOISE = True
POSTPROCESS_OUTPUT = True
SPEED = 1.0

SPEAKER_SLUGS = {
    "[NAM]": "nam",
    "[NỮ]": "nu",
}
