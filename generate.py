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
    for tag, fname in config.SPEAKERS.items():
        if not (config.SAMPLES_DIR / fname).is_file():
            missing.append(f"{config.SAMPLES_DIR / fname} (for {tag})")
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


def init_tts():
    os.environ.setdefault("COQUI_TOS_AGREED", "1")
    os.environ.setdefault("TTS_HOME", str(config.MODELS_DIR))
    os.environ.setdefault("HF_HOME", str(config.MODELS_DIR / "hf"))
    config.MODELS_DIR.mkdir(parents=True, exist_ok=True)

    import torch
    from huggingface_hub import snapshot_download
    from TTS.tts.configs.xtts_config import XttsConfig
    from TTS.tts.models.xtts import Xtts

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[init] device: {device}")

    print(f"[init] downloading {config.MODEL_NAME} (cached after first run)")
    model_dir = Path(
        snapshot_download(
            repo_id=config.MODEL_NAME,
            cache_dir=str(config.MODELS_DIR / "hf"),
        )
    )

    cfg = XttsConfig()
    cfg.load_json(str(model_dir / "config.json"))
    model = Xtts.init_from_config(cfg)
    model.load_checkpoint(cfg, checkpoint_dir=str(model_dir), use_deepspeed=False)
    if device == "cuda":
        model.cuda()
    print("[init] model loaded")
    return model


def _chunk_path(index: int, speaker_tag: str, key: str) -> Path:
    slug = config.SPEAKER_SLUGS[speaker_tag]
    return config.CHUNKS_DIR / f"chunk_{index:03d}_{slug}_{key}.wav"


def _chunk_key(speaker_wav: Path, text: str) -> str:
    h = hashlib.sha1()
    h.update(speaker_wav.read_bytes())
    h.update(b"\0")
    h.update(text.encode("utf-8"))
    return h.hexdigest()[:12]


def generate_chunk(model, text: str, speaker_tag: str, index: int) -> Path:
    import torch
    import torchaudio

    speaker_wav = config.SAMPLES_DIR / config.SPEAKERS[speaker_tag]
    key = _chunk_key(speaker_wav, text)
    out_path = _chunk_path(index, speaker_tag, key)

    if out_path.exists():
        print(f"  cache hit: {out_path.name}")
        return out_path

    gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(
        audio_path=[str(speaker_wav)]
    )
    result = model.inference(
        text=text,
        language=config.LANGUAGE,
        gpt_cond_latent=gpt_cond_latent,
        speaker_embedding=speaker_embedding,
    )
    wav = torch.tensor(result["wav"]).unsqueeze(0)
    torchaudio.save(str(out_path), wav, 24000)
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

    chunk_files: list[Path] = []
    first_t: float | None = None
    for i, (tag, text) in enumerate(turns, start=1):
        preview = text if len(text) <= 60 else text[:57] + "..."
        print(f"[{i}/{total}] {tag} {preview!r}")
        t0 = time.monotonic()
        try:
            out = generate_chunk(model, text, tag, i)
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
