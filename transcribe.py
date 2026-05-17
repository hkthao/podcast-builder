"""One-shot: transcribe samples/{male,female}.wav using HF Whisper.

Prints results as `<tag>\\t<wav>\\t<text>` lines to stdout so the caller can
write the .txt files on the host (the samples mount is read-only in the
container).

    docker compose run --rm --entrypoint python podcast transcribe.py
"""
import os
from pathlib import Path

import config

os.environ.setdefault("HF_HOME", str(config.MODELS_DIR / "hf"))
config.MODELS_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    import torch
    from transformers import pipeline

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    model_id = "openai/whisper-large-v3-turbo"
    print(f"[asr] loading {model_id} on {device} (first run pulls ~1.5GB)")

    asr = pipeline(
        "automatic-speech-recognition",
        model=model_id,
        device=device,
        torch_dtype=dtype,
        chunk_length_s=30,
    )

    import sys

    for tag, (wav_name, txt_name) in config.SPEAKERS.items():
        wav_path = config.SAMPLES_DIR / wav_name
        if not wav_path.is_file():
            print(f"[skip] {tag}: {wav_path} not found", file=sys.stderr)
            continue

        print(f"[asr] {tag}: transcribing {wav_path.name} ...", file=sys.stderr)
        # Auto-detect language: ref samples may be English (Google AI Studio
        # voices like Leda/Orus) even when the script target is Vietnamese —
        # OmniVoice handles the cross-lingual case at synthesis time.
        result = asr(
            str(wav_path),
            generate_kwargs={"task": "transcribe"},
            return_timestamps=False,
        )
        text = result["text"].strip().replace("\t", " ").replace("\n", " ")
        # Marker line — the host script greps for "RESULT\t" to dodge HF logs.
        print(f"RESULT\t{tag}\t{txt_name}\t{text}")


if __name__ == "__main__":
    main()
