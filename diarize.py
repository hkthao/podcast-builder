"""F0-based speaker split for a male/female podcast — Whisper-free.

Pipeline:
  1. Load sample.m4a at 16 kHz mono.
  2. Slide a 1-second window (0.5 s hop) over the audio, run librosa.pyin
     on each, record median F0 (or NaN if unvoiced).
  3. K-means(k=2) on voiced F0 values → "male" (low centroid) / "female".
  4. Median-filter the per-window labels to remove single-window spikes.
  5. Find contiguous same-label runs of length >= MIN_LEN with no
     other-gender windows inside; pick the longest per gender, trim to
     MAX_LEN around its center.

Prints two RESULT lines for the host:

    RESULT\\t<gender>\\t<start_sec>\\t<end_sec>\\t<mean_f0_hz>
"""
import os
import sys

import config

os.environ.setdefault("HF_HOME", str(config.MODELS_DIR / "hf"))

INPUT = config.SAMPLES_DIR / "sample.m4a"
WIN_LEN = 1.0     # seconds
HOP_LEN = 0.5     # seconds (so each window has 50% overlap with neighbours)
MIN_LEN = 6.0
MAX_LEN = 10.0
EDGE_TRIM = 0.2   # trim ~0.2s per edge to avoid speaker bleed


def main() -> None:
    if not INPUT.is_file():
        sys.exit(f"error: {INPUT} not found")

    import librosa
    import numpy as np
    from sklearn.cluster import KMeans

    print(f"[load] {INPUT.name} ...", file=sys.stderr)
    audio, sr = librosa.load(str(INPUT), sr=16000, mono=True)
    total_dur = len(audio) / sr
    print(f"[load] duration={total_dur:.1f}s", file=sys.stderr)

    win = int(WIN_LEN * sr)
    hop = int(HOP_LEN * sr)
    starts = np.arange(0, len(audio) - win, hop)
    print(f"[f0] computing F0 over {len(starts)} windows ...", file=sys.stderr)

    f0_per_win = np.full(len(starts), np.nan, dtype=np.float32)
    for i, st in enumerate(starts):
        seg = audio[st : st + win]
        f0, _, _ = librosa.pyin(
            seg, fmin=65.0, fmax=400.0, sr=sr, frame_length=2048
        )
        f0_clean = f0[~np.isnan(f0)] if f0 is not None else np.array([])
        if len(f0_clean) >= 3:
            f0_per_win[i] = float(np.median(f0_clean))
        if (i + 1) % 200 == 0:
            print(f"  progress {i+1}/{len(starts)}", file=sys.stderr)

    voiced_idx = np.where(~np.isnan(f0_per_win))[0]
    voiced_f0 = f0_per_win[voiced_idx]
    print(f"[f0] voiced windows: {len(voiced_idx)}/{len(starts)}", file=sys.stderr)
    if len(voiced_idx) < 20:
        sys.exit("error: not enough voiced windows — sample too short/noisy")

    km = KMeans(n_clusters=2, random_state=0, n_init=10).fit(voiced_f0.reshape(-1, 1))
    centroids = km.cluster_centers_.flatten()
    male_label = int(np.argmin(centroids))
    print(
        f"[f0] centroids: male≈{centroids[male_label]:.1f}Hz, "
        f"female≈{centroids[1 - male_label]:.1f}Hz",
        file=sys.stderr,
    )

    # Label per window: 0=male, 1=female, -1=silence/unvoiced.
    labels = np.full(len(starts), -1, dtype=np.int8)
    for i, vi in enumerate(voiced_idx):
        labels[vi] = 0 if km.labels_[i] == male_label else 1

    # Median-filter labels with a 5-window kernel to drop single-window flips.
    smoothed = labels.copy()
    for i in range(2, len(labels) - 2):
        window = labels[i - 2 : i + 3]
        voiced = window[window >= 0]
        if len(voiced) >= 3:
            vals, cnt = np.unique(voiced, return_counts=True)
            smoothed[i] = int(vals[np.argmax(cnt)])
    labels = smoothed

    # Find contiguous runs (allow silence inside as long as no other-gender label).
    def runs_for(target: int):
        runs = []
        cur = None  # {"start_i", "end_i", "f0_sum", "f0_n"}
        for i, lab in enumerate(labels):
            if lab == target:
                if cur is None:
                    cur = {"start_i": i, "end_i": i, "f0_sum": 0.0, "f0_n": 0}
                cur["end_i"] = i
                if not np.isnan(f0_per_win[i]):
                    cur["f0_sum"] += float(f0_per_win[i])
                    cur["f0_n"] += 1
            elif lab == -1:
                # silence: keep extending if we're in a run, but cap silence span
                if cur is not None:
                    # only extend if silence < 1.5s (3 windows of 0.5s hop)
                    if i - cur["end_i"] <= 3:
                        cur["end_i"] = i
                    else:
                        runs.append(cur)
                        cur = None
            else:
                # other gender — close run
                if cur is not None:
                    runs.append(cur)
                    cur = None
        if cur is not None:
            runs.append(cur)
        return runs

    for gender_idx, gender in enumerate(("male", "female")):
        runs = runs_for(gender_idx)
        if not runs:
            print(f"[warn] no runs for {gender}", file=sys.stderr)
            continue
        # Convert window indices → seconds. Run covers from start of first
        # window to end of last window.
        for r in runs:
            r["start_s"] = float(starts[r["start_i"]]) / sr
            r["end_s"] = float(starts[r["end_i"]]) / sr + WIN_LEN
            r["dur"] = r["end_s"] - r["start_s"]

        usable = [r for r in runs if r["dur"] >= MIN_LEN] or runs
        chosen = max(usable, key=lambda r: r["dur"])

        s, e = chosen["start_s"], chosen["end_s"]
        if e - s > MAX_LEN:
            mid = (s + e) / 2
            s = mid - MAX_LEN / 2
            e = mid + MAX_LEN / 2
        s += EDGE_TRIM
        e -= EDGE_TRIM

        mean_f0 = chosen["f0_sum"] / max(chosen["f0_n"], 1)
        print(f"RESULT\t{gender}\t{s:.3f}\t{e:.3f}\t{mean_f0:.1f}")


if __name__ == "__main__":
    main()
