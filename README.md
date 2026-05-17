# podcast-builder

Local TTS podcast builder. Clones two voices (male / female) from short audio
samples and assembles a Vietnamese script into a single MP3.

Powered by [OmniVoice](https://github.com/k2-fsa/OmniVoice) — the same
zero-shot diffusion TTS engine used by
[OmniVoice Studio](https://github.com/debpalash/OmniVoice-Studio). 600+
languages, Apache-2.0 licensed, handles Vietnamese tones / diacritics much
better than the previous viXTTS pipeline.

## Layout

```text
samples/
  male.wav      # voice sample for [NAM]
  male.txt      # exact transcript of male.wav
  female.wav    # voice sample for [NỮ]
  female.txt    # exact transcript of female.wav
script.txt      # the podcast script (see format below)
output/         # generated audio (podcast.mp3 + per-turn chunks)
models/         # downloaded OmniVoice weights (~2.4GB, persists across runs)
```

## Voice samples

- 3–10 seconds of clean speech, single speaker, no music or noise (longer
  works but quality degrades past ~20s).
- Mono WAV — any sample rate, OmniVoice resamples to 24 kHz internally.
- Save as `samples/male.wav` and `samples/female.wav`.

### Reference transcript (required)

OmniVoice does voice cloning from `(ref_audio, ref_text)` pairs. The transcript
should be the **exact** Vietnamese text spoken in the corresponding `.wav`,
written naturally with punctuation:

```text
samples/male.txt:
    Xin chào, tôi là người dẫn chương trình hôm nay.

samples/female.txt:
    Chào các bạn, rất vui được gặp lại mọi người.
```

Accurate transcripts noticeably improve cloning quality vs. auto-ASR.

## Script format

UTF-8 text. One turn per line, prefixed with a speaker tag:

```text
[NAM] Xin chào và chào mừng các bạn đến với podcast hôm nay.
[NỮ] Chào mừng mọi người, hôm nay chúng ta sẽ có một chủ đề rất thú vị.
# lines starting with # are comments
```

Speaker tags: `[NAM]` (male) and `[NỮ]` (female).

## Run with Docker (recommended)

CPU:

```sh
docker compose run --rm podcast
```

GPU (NVIDIA + nvidia-container-toolkit on host):

```sh
docker compose --profile gpu run --rm podcast-gpu
```

First run downloads OmniVoice weights (~2.4GB) into `./models/`. Subsequent
runs reuse the cache.

Output: `output/podcast.mp3`.

## Run without Docker

Requires Python 3.11+, `ffmpeg` on PATH, optional CUDA / Apple Silicon MPS.

```sh
pip install -r requirements.txt
python generate.py
```

> **Apple Silicon (M1/M2/M3/M4):** PyTorch MPS is auto-detected, no extra
> setup needed. The OmniVoice model fits comfortably in 16 GB unified memory.

## Resume / caching

Each turn is rendered to `output/chunks/chunk_NNN_<nam|nu>_<hash>.wav`.
The hash is keyed on the speaker sample bytes, the reference transcript, the
target text, and the model name, so:

- Re-running with no changes is a no-op (all chunk files exist).
- Editing one line only re-renders that one chunk.
- Replacing `male.wav` or `male.txt` invalidates only the male chunks.
- Changing `MODEL_NAME` in `config.py` invalidates everything.

To force a full rebuild, delete `output/chunks/`.

## Tuning

OmniVoice generation parameters live in `config.py`:

- `NUM_STEP` (default 32) — more steps = better quality, slower.
- `GUIDANCE_SCALE` (default 2.0) — higher follows the prompt more strictly.
- `SPEED` (default 1.0) — `> 1.0` faster, `< 1.0` slower.
- `DENOISE` (default `True`) — prepends `<|denoise|>` token for cleaner output.

## Troubleshooting

- **`ffmpeg not found`** — install ffmpeg (the Docker image already has it).
- **First run hangs at model download** — it's pulling ~2.4GB from
  HuggingFace. Watch `./models/hf/`.
- **`transformers` version mismatch** — OmniVoice needs `transformers>=5.3`.
  Upgrade with `pip install -U -r requirements.txt`.
- **Wrong-language / garbled output** — verify `samples/*.txt` matches the
  spoken audio exactly, and that `LANGUAGE = "vi"` in `config.py`.

## License

- `podcast-builder` itself: see [`LICENSE`](LICENSE).
- OmniVoice model weights: Apache-2.0 (commercial use permitted, unlike the
  CPML-only viXTTS this project used previously).
