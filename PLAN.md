# Podcast Builder — Implementation Plan (revised)

> **Superseded — historical plan.** This document describes the original
> viXTTS-based pipeline. The project has since switched to
> [OmniVoice](https://github.com/k2-fsa/OmniVoice) (k2-fsa) — the engine
> used by [OmniVoice Studio](https://github.com/debpalash/OmniVoice-Studio) —
> for noticeably better Vietnamese quality and an Apache-2.0 license (no
> longer CPML-only). See `README.md` for the current setup. Key deltas:
> coqui-tts → omnivoice, Python 3.10 → 3.11, `samples/*.txt` ref transcripts
> are now required, model size 2 GB → 2.4 GB.

## Goal
Build a local TTS podcast builder that clones 2 voices (male / female) from short audio
samples and assembles them into a complete podcast audio file from a Vietnamese script.
Runs reproducibly inside Docker (CPU or GPU).

---

## Decisions resolved from plan review

- **TTS model:** XTTS v2 does **not** officially support Vietnamese. Use **viXTTS**
  (community Vietnamese fine-tune of XTTS v2). Same `tts_to_file(speaker_wav=...)` API.
  Repo: `https://huggingface.co/capleaf/viXTTS`
- **Library:** `coqui-tts` (maintained idiap fork) instead of unmaintained `TTS`.
  Drop `ffmpeg-python` (pydub already shells out to ffmpeg).
- **License notes:** XTTS v2 / viXTTS weights are CPML (non-commercial). Document this
  in the README. Set `COQUI_TOS_AGREED=1` so model download is non-interactive.
- **Resume cache:** key chunk filenames on `sha1(speaker_wav_bytes + text)` so that
  changing a sample wav or a script line invalidates only the affected chunk.

---

## Project structure

```
podcast-builder/
├── samples/
│   ├── male.wav
│   └── female.wav
├── script.txt
├── output/
│   └── chunks/
├── models/                  # mounted volume — caches viXTTS weights (~2GB)
├── generate.py
├── config.py
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
└── README.md
```

---

## Step 1 — Dependencies (`requirements.txt`)

Pinned to a known-working set:

```
coqui-tts==0.24.*
pydub==0.25.1
torch==2.1.*
torchaudio==2.1.*
huggingface-hub>=0.23
```

`ffmpeg` is provided by the Docker base image (apt), not pip.

---

## Step 2 — Config (`config.py`)

- `SAMPLES_DIR = Path("samples")`
- `SPEAKERS = {"[NAM]": "male.wav", "[NỮ]": "female.wav"}`
- `OUTPUT_DIR = Path("output")`, `CHUNKS_DIR = OUTPUT_DIR / "chunks"`
- `MODELS_DIR = Path("models")`  # set as `TTS_HOME` so weights persist on the volume
- `SILENCE_MS = 400`
- `MODEL_NAME = "capleaf/viXTTS"`  (downloaded from HF; not the default Coqui registry)
- `LANGUAGE = "vi"`
- `TARGET_DBFS = -20.0`
- `OUTPUT_BITRATE = "192k"`

All paths via `pathlib.Path`.

---

## Step 3 — Script parser (`parse_script`)

- Open `script.txt` with `encoding="utf-8"` (Vietnamese diacritics).
- Skip empty lines and `#` comment lines.
- Match lines as `[SPEAKER] text` where `SPEAKER` is a key in `SPEAKERS`.
- Return `[(speaker_tag, text), ...]`.
- Raise a clear `ValueError` with line number on malformed lines or unknown speakers.

---

## Step 4 — TTS engine

`init_tts()`:
- Set `os.environ["TTS_HOME"] = str(MODELS_DIR)` and `COQUI_TOS_AGREED=1` before import.
- Download viXTTS weights from HF on first run; reuse on subsequent runs.
- Use CUDA if `torch.cuda.is_available()`, else CPU. Log which one.

`generate_chunk(tts, text, speaker_tag, index)`:
- Resolve `speaker_wav` from `SPEAKERS[speaker_tag]`.
- Compute `key = sha1(speaker_wav_bytes + text.encode()).hexdigest()[:12]`.
- Output path: `chunks/chunk_{index:03d}_{nam|nu}_{key}.wav` (no brackets in filename).
- If the file exists, skip generation (resume support, sample-aware via the hash).
- Call `tts.tts_to_file(text=text, speaker_wav=..., language="vi", file_path=...)`.
- On failure: log the index + exception and **fail fast** (return non-zero) — do not
  silently produce a podcast with missing turns.

---

## Step 5 — Audio assembly (`assemble_podcast`)

- Load each chunk with `pydub.AudioSegment`.
- Apply peak normalization to `TARGET_DBFS` (call it "peak normalization", not "loudness").
- Insert `SILENCE_MS` of silence between chunks.
- Concatenate, export to `output/podcast.mp3` at `192k`.
- Print final duration (`len(combined) / 1000`s).

---

## Step 6 — Main orchestration

1. Validate `samples/male.wav`, `samples/female.wav`, `script.txt` exist.
2. Check `ffmpeg` is on PATH; if missing, print a clear error.
3. `mkdir -p output/chunks models`.
4. `parse_script()` → print total turn count.
5. `init_tts()`.
6. Loop turns; for each, `generate_chunk()`. Log progress as
   `[3/12] [NAM] "text preview..."`. Print ETA after first chunk completes.
7. `assemble_podcast(chunk_files, "output/podcast.mp3")`.
8. Print final path + total duration.

---

## Step 7 — Sample `script.txt`

```
[NAM] Xin chào và chào mừng các bạn đến với podcast hôm nay.
[NỮ] Chào mừng mọi người, hôm nay chúng ta sẽ có một chủ đề rất thú vị.
[NAM] Đúng vậy, chúng ta sẽ nói về trí tuệ nhân tạo và tương lai của nó.
[NỮ] Theo bạn, AI sẽ thay đổi cuộc sống của chúng ta như thế nào?
[NAM] Tôi nghĩ AI sẽ hỗ trợ con người trong hầu hết mọi lĩnh vực.
[NỮ] Cảm ơn các bạn đã lắng nghe, hẹn gặp lại trong tập tiếp theo.
```

---

## Step 8 — Docker setup

### `Dockerfile`

Single-stage, CUDA-capable base so the same image runs on CPU or GPU.

```dockerfile
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    COQUI_TOS_AGREED=1 \
    TTS_HOME=/app/models \
    HF_HOME=/app/models/hf

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.10 python3-pip python3.10-venv \
        ffmpeg git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.10 /usr/bin/python && \
    ln -sf /usr/bin/pip3 /usr/bin/pip

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY config.py generate.py ./

# samples/, script.txt, output/, models/ come in as volumes
ENTRYPOINT ["python", "generate.py"]
```

### `docker-compose.yml`

GPU profile is opt-in (`docker compose --profile gpu up`); default is CPU.

```yaml
services:
  podcast:
    build: .
    image: podcast-builder:latest
    volumes:
      - ./samples:/app/samples:ro
      - ./script.txt:/app/script.txt:ro
      - ./output:/app/output
      - ./models:/app/models           # persists viXTTS weights (~2GB)
    environment:
      - COQUI_TOS_AGREED=1

  podcast-gpu:
    extends: podcast
    profiles: ["gpu"]
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

### `.dockerignore`

```
.git
output/
models/
__pycache__/
*.pyc
.venv/
.env
```

(Keeps the image small and avoids baking large local caches into layers.)

---

## Step 9 — README

Cover:
- What it does + viXTTS license caveat (non-commercial CPML).
- Sample requirements: 6–30s clean mono WAV, ideally 22050 Hz, single speaker, no music.
- Script format spec.
- **Run with Docker (recommended)**:
  - CPU: `docker compose run --rm podcast`
  - GPU: `docker compose --profile gpu run --rm podcast-gpu`
  - First run downloads viXTTS (~2GB) into `./models/` — persisted across runs.
- **Run without Docker** (Python 3.10, ffmpeg installed, optional CUDA):
  - `pip install -r requirements.txt && python generate.py`
- Note: chunk cache is keyed on sample wav contents + text — replacing a sample
  invalidates only its chunks.

---

## Validation checklist (do before writing application code)

1. `docker build .` succeeds on a clean machine.
2. `docker compose run --rm podcast` produces `output/podcast.mp3` from the sample
   script and bundled (or user-provided) sample wavs.
3. Re-running is a no-op for unchanged turns (cache hits) and only regenerates the
   chunks whose text or sample changed.
4. GPU profile works on a CUDA host (`nvidia-smi` inside container shows the device).
