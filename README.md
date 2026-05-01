# podcast-builder

Local TTS podcast builder. Clones two voices (male / female) from short audio
samples and assembles a Vietnamese script into a single MP3.

Powered by [viXTTS](https://huggingface.co/capleaf/viXTTS), a Vietnamese
fine-tune of XTTS v2.

> **License note:** viXTTS / XTTS v2 weights are released under the
> [Coqui Public Model License (CPML)](https://coqui.ai/cpml) — non-commercial
> use only. Don't ship this into a paid product.

## Layout

```
samples/
  male.wav      # voice sample for [NAM]
  female.wav    # voice sample for [NỮ]
script.txt      # the podcast script (see format below)
output/         # generated audio (podcast.mp3 + per-turn chunks)
models/         # downloaded viXTTS weights (~2GB, persists across runs)
```

## Voice samples

- 6–30 seconds of clean speech, single speaker, no music or noise.
- Mono WAV, ideally 22050 Hz (other rates work but get resampled).
- Save as `samples/male.wav` and `samples/female.wav`.

## Script format

UTF-8 text. One turn per line, prefixed with a speaker tag:

```
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

First run downloads viXTTS weights (~2GB) into `./models/`. Subsequent runs
reuse the cache.

Output: `output/podcast.mp3`.

## Run without Docker

Requires Python 3.10, `ffmpeg` on PATH, optional CUDA.

```sh
pip install -r requirements.txt
python generate.py
```

## Resume / caching

Each turn is rendered to `output/chunks/chunk_NNN_<nam|nu>_<hash>.wav`.
The hash is keyed on the speaker sample bytes plus the line text, so:

- Re-running with no changes is a no-op (all chunk files exist).
- Editing one line only re-renders that one chunk.
- Replacing `male.wav` invalidates only the male chunks.

To force a full rebuild, delete `output/chunks/`.

## Troubleshooting

- **`ffmpeg not found`** — install ffmpeg (the Docker image already has it).
- **First run hangs at model download** — it's pulling ~2GB. Watch `./models/`.
- **Garbled / wrong-language output** — make sure samples are clean and the
  language stays `vi` in `config.py`. viXTTS is tuned for Vietnamese; other
  languages will sound off.
