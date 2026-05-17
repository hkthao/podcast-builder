import hashlib
import os
import shutil
import sys
import time
from pathlib import Path

import config


def _ensure_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        sys.exit(
            "error: ffmpeg not found on PATH.\n"
            "  - Docker: rebuild the image (ffmpeg is in the Dockerfile).\n"
            "  - macOS: brew install ffmpeg\n"
            "  - Debian/Ubuntu: apt-get install ffmpeg"
        )


def _validate_inputs() -> None:
    missing = []
    for tag, (wav, txt) in config.SPEAKERS.items():
        if not (config.SAMPLES_DIR / wav).is_file():
            missing.append(f"{config.SAMPLES_DIR / wav} (audio for {tag})")
        if not (config.SAMPLES_DIR / txt).is_file():
            missing.append(
                f"{config.SAMPLES_DIR / txt} (transcript for {tag} — "
                f"the exact text spoken in {wav})"
            )
    if not config.SCRIPT_PATH.is_file():
        missing.append(str(config.SCRIPT_PATH))
    if missing:
        sys.exit("error: missing required input files:\n  - " + "\n  - ".join(missing))


def parse_script(path: Path) -> list[tuple[str, str]]:
    turns: list[tuple[str, str]] = []
    with path.open("r", encoding="utf-8") as f:
        for lineno, raw in enumerate(f, start=1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if not line.startswith("["):
                raise ValueError(f"{path}:{lineno}: line must start with a [SPEAKER] tag")
            try:
                end = line.index("]")
            except ValueError:
                raise ValueError(f"{path}:{lineno}: missing closing ']' in speaker tag")
            tag = line[: end + 1]
            text = line[end + 1 :].strip()
            if tag not in config.SPEAKERS:
                known = ", ".join(config.SPEAKERS.keys())
                raise ValueError(f"{path}:{lineno}: unknown speaker {tag!r} (known: {known})")
            if not text:
                raise ValueError(f"{path}:{lineno}: empty text after speaker tag")
            turns.append((tag, text))
    if not turns:
        raise ValueError(f"{path}: no usable lines (file is empty or all comments)")
    return turns


def _best_device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def init_tts():
    os.environ.setdefault("HF_HOME", str(config.MODELS_DIR / "hf"))
    config.MODELS_DIR.mkdir(parents=True, exist_ok=True)

    import torch
    from omnivoice.models.omnivoice import OmniVoice

    device = _best_device()
    dtype = torch.float16 if device in ("cuda", "mps") else torch.float32
    print(f"[init] device: {device}, dtype: {dtype}")
    print(f"[init] loading {config.MODEL_NAME} (cached after first run)")

    model = OmniVoice.from_pretrained(
        config.MODEL_NAME,
        device_map=device,
        dtype=dtype,
    )
    print("[init] model loaded")
    return model


def build_voice_prompts(model) -> dict:
    prompts = {}
    for tag, (wav, txt) in config.SPEAKERS.items():
        wav_path = config.SAMPLES_DIR / wav
        ref_text = (config.SAMPLES_DIR / txt).read_text(encoding="utf-8").strip()
        if not ref_text:
            sys.exit(f"error: {config.SAMPLES_DIR / txt} is empty (need transcript of {wav})")
        print(f"[clone] {tag}: encoding {wav} ({len(ref_text)} chars of ref_text)")
        prompts[tag] = model.create_voice_clone_prompt(
            ref_audio=str(wav_path),
            ref_text=ref_text,
        )
    return prompts


def _chunk_path(index: int, speaker_tag: str, key: str) -> Path:
    slug = config.SPEAKER_SLUGS[speaker_tag]
    return config.CHUNKS_DIR / f"chunk_{index:03d}_{slug}_{key}.wav"


def _chunk_key(speaker_wav: Path, ref_text: str, text: str) -> str:
    h = hashlib.sha1()
    h.update(speaker_wav.read_bytes())
    h.update(b"\0")
    h.update(ref_text.encode("utf-8"))
    h.update(b"\0")
    h.update(text.encode("utf-8"))
    h.update(b"\0")
    h.update(config.MODEL_NAME.encode("utf-8"))
    return h.hexdigest()[:12]


def generate_chunk(model, prompts, text: str, speaker_tag: str, index: int) -> Path:
    import numpy as np
    import soundfile as sf
    import torch

    wav_name, txt_name = config.SPEAKERS[speaker_tag]
    speaker_wav = config.SAMPLES_DIR / wav_name
    ref_text = (config.SAMPLES_DIR / txt_name).read_text(encoding="utf-8").strip()
    key = _chunk_key(speaker_wav, ref_text, text)
    out_path = _chunk_path(index, speaker_tag, key)

    if out_path.exists():
        print(f"  cache hit: {out_path.name}")
        return out_path

    audios = model.generate(
        text=text,
        language=config.LANGUAGE,
        voice_clone_prompt=prompts[speaker_tag],
        num_step=config.NUM_STEP,
        guidance_scale=config.GUIDANCE_SCALE,
        t_shift=config.T_SHIFT,
        denoise=config.DENOISE,
        postprocess_output=config.POSTPROCESS_OUTPUT,
        speed=config.SPEED,
    )
    audio = audios[0]
    if isinstance(audio, torch.Tensor):
        audio = audio.detach().cpu().to(torch.float32).numpy()
    # soundfile expects (frames,) mono or (frames, channels). Model returns
    # (1, T) or (T,) — squeeze to 1-D.
    audio = np.asarray(audio, dtype=np.float32).squeeze()
    sf.write(str(out_path), audio, model.sampling_rate, subtype="PCM_16")
    return out_path


def assemble_podcast(chunk_files: list[Path], output_path: Path) -> None:
    from pydub import AudioSegment

    silence = AudioSegment.silent(duration=config.SILENCE_MS)
    combined = AudioSegment.empty()
    for i, p in enumerate(chunk_files):
        seg = AudioSegment.from_file(p)
        gain = config.TARGET_DBFS - seg.max_dBFS
        seg = seg.apply_gain(gain)
        if i > 0:
            combined += silence
        combined += seg

    output_path.parent.mkdir(parents=True, exist_ok=True)
    combined.export(output_path, format="mp3", bitrate=config.OUTPUT_BITRATE)
    duration_s = len(combined) / 1000
    print(f"[done] {output_path}  ({duration_s:.1f}s)")


def main() -> None:
    _ensure_ffmpeg()
    _validate_inputs()
    config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    config.CHUNKS_DIR.mkdir(parents=True, exist_ok=True)

    turns = parse_script(config.SCRIPT_PATH)
    total = len(turns)
    print(f"[script] {total} turns")

    model = init_tts()
    prompts = build_voice_prompts(model)

    chunk_files: list[Path] = []
    first_t: float | None = None
    for i, (tag, text) in enumerate(turns, start=1):
        preview = text if len(text) <= 60 else text[:57] + "..."
        print(f"[{i}/{total}] {tag} {preview!r}")
        t0 = time.monotonic()
        try:
            out = generate_chunk(model, prompts, text, tag, i)
        except Exception as e:
            sys.exit(f"error: failed to generate chunk {i} ({tag}): {e}")
        chunk_files.append(out)
        if first_t is None:
            first_t = time.monotonic() - t0
            remaining = first_t * (total - 1)
            print(f"  first chunk: {first_t:.1f}s — rough ETA: {remaining:.0f}s")

    assemble_podcast(chunk_files, config.PODCAST_PATH)


if __name__ == "__main__":
    main()
