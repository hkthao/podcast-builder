/**
 * CompTab — Ghép & vá audio NotebookLM.
 *
 * Giữ một bản nền tốt nhất, thay các câu lỗi (đảo xưng hô / nuốt chữ) bằng
 * câu tương ứng từ bản gen khác → xuất bản master sạch. Mối nối được server
 * snap vào khoảng lặng + crossfade nên không lủng củng.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Pause,
  Loader2,
  Scissors,
  Wand2,
  Check,
  X as XIcon,
  AlertTriangle,
  Mic,
  Upload,
  Copy,
  Pencil,
} from "lucide-react";
import {
  api,
  type CompAlignRow,
  type CompAlignCandidate,
  type CompPatch,
  type CompJob,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Nút copy nhỏ — bấm copy text vào clipboard, hiện ✓ 1.2s. */
function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1 text-muted-foreground hover:text-foreground",
        className,
      )}
      title="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard bị chặn — bỏ qua */
        }
      }}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-600" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {label && <span>{copied ? "đã copy" : label}</span>}
    </button>
  );
}

/** Một <audio> dùng chung, phát đúng đoạn [startMs,endMs] rồi tự dừng. */
function usePreviewPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  useEffect(() => {
    const a = new Audio();
    audioRef.current = a;
    const onTime = () => {
      if (stopAtRef.current !== null && a.currentTime >= stopAtRef.current) {
        a.pause();
        stopAtRef.current = null;
        setPlayingKey(null);
      }
    };
    const onEnded = () => setPlayingKey(null);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnded);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnded);
    };
  }, []);

  const play = (key: string, url: string, startMs: number, endMs: number) => {
    const a = audioRef.current;
    if (!a) return;
    if (playingKey === key) {
      a.pause();
      setPlayingKey(null);
      return;
    }
    if (!a.src.endsWith(url)) a.src = url;
    stopAtRef.current = endMs / 1000;
    a.currentTime = startMs / 1000;
    void a.play();
    setPlayingKey(key);
  };

  return { play, playingKey };
}

type Props = { episodeName: string };

export function CompTab({ episodeName }: Props) {
  const qc = useQueryClient();
  const { play, playingKey } = usePreviewPlayer();

  const takesQ = useQuery({
    queryKey: ["comp-takes", episodeName],
    queryFn: () => api.listTakes(episodeName),
  });
  const takes = takesQ.data?.takes ?? [];
  const transcribed = takes.filter((t) => t.hasTranscript);
  const urlByVariant = useMemo(
    () => Object.fromEntries(takes.map((t) => [t.variant, t.url])),
    [takes],
  );

  const [base, setBase] = useState<string>("");
  // chọn base mặc định = primary nếu đã transcribe, else bản transcribed đầu tiên
  useEffect(() => {
    if (base && takes.some((t) => t.variant === base)) return;
    const def =
      transcribed.find((t) => t.variant === "primary")?.variant ??
      transcribed[0]?.variant ??
      "";
    if (def) setBase(def);
  }, [takes]); // eslint-disable-line react-hooks/exhaustive-deps

  // patches: key theo baseRowId
  const [patches, setPatches] = useState<Map<number, CompPatch & { baseText: string; candText: string }>>(
    new Map(),
  );
  useEffect(() => setPatches(new Map()), [base]);

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobKind, setJobKind] = useState<"transcribe" | "build" | null>(null);
  const [compUrl, setCompUrl] = useState<string | null>(null);
  const [compDurationMs, setCompDurationMs] = useState<number | null>(null);

  // poll job
  const jobQ = useQuery({
    queryKey: ["comp-job", episodeName, jobId],
    queryFn: () => api.getCompJob(episodeName, jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => {
      const d = q.state.data as CompJob | undefined;
      return d && d.status !== "running" ? false : 1500;
    },
  });
  useEffect(() => {
    const job = jobQ.data;
    if (!job || job.status === "running") return;
    if (job.status === "done") {
      if (job.kind === "transcribe") {
        void qc.invalidateQueries({ queryKey: ["comp-takes", episodeName] });
      } else if (job.kind === "build") {
        const r = job.result as { url: string; durationMs: number };
        setCompUrl(`${r.url}?t=${Date.now()}`);
        setCompDurationMs(r.durationMs);
      }
    }
    setJobId(null);
    setJobKind(null);
  }, [jobQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const alignQ = useQuery({
    queryKey: ["comp-align", episodeName, base],
    queryFn: () => api.alignTakes(episodeName, base),
    enabled: !!base && transcribed.some((t) => t.variant === base),
  });
  const ALIGN_PAGE_SIZE = 25;
  const [alignPage, setAlignPage] = useState(0);
  const alignRows = alignQ.data?.rows ?? [];
  const alignPageCount = Math.max(1, Math.ceil(alignRows.length / ALIGN_PAGE_SIZE));
  const alignCur = Math.min(alignPage, alignPageCount - 1);
  const alignStart = alignCur * ALIGN_PAGE_SIZE;
  // Reset về trang đầu khi đổi bản base.
  useEffect(() => setAlignPage(0), [base]);

  const transcribeMut = useMutation({
    mutationFn: (variants?: string[]) =>
      api.transcribeTakes(episodeName, variants),
    onSuccess: (r) => {
      setJobId(r.jobId);
      setJobKind("transcribe");
    },
  });

  const buildMut = useMutation({
    mutationFn: () =>
      api.buildComp(
        episodeName,
        base,
        [...patches.values()].map(
          ({ baseStartMs, baseEndMs, variant, startMs, endMs }) => ({
            baseStartMs,
            baseEndMs,
            variant,
            startMs,
            endMs,
          }),
        ),
      ),
    onSuccess: (r) => {
      setCompUrl(null);
      setJobId(r.jobId);
      setJobKind("build");
    },
  });

  const promoteMut = useMutation({
    mutationFn: () => api.promoteComp(episodeName),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["episode", episodeName] });
      void qc.invalidateQueries({ queryKey: ["episode-files", episodeName] });
      void qc.invalidateQueries({ queryKey: ["transcript", episodeName] });
    },
  });

  const deleteTakeMut = useMutation({
    mutationFn: (variant: string) => api.deleteCompTake(episodeName, variant),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["comp-takes", episodeName] }),
  });

  // Upload NHIỀU bản vá (mỗi bản gồm nhiều câu đã gen lại) làm donor →
  // transcribe tất cả để align.
  const [uploading, setUploading] = useState(false);
  const uploadTakes = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const variants: string[] = [];
      for (const f of files) {
        const take = await api.uploadCompTake(episodeName, f);
        variants.push(take.variant);
      }
      await qc.invalidateQueries({ queryKey: ["comp-takes", episodeName] });
      const r = await api.transcribeTakes(episodeName, variants);
      setJobId(r.jobId);
      setJobKind("transcribe");
    } finally {
      setUploading(false);
    }
  };

  const addPatch = (row: CompAlignRow, cand: CompAlignCandidate) => {
    setPatches((prev) => {
      const next = new Map(prev);
      next.set(row.id, {
        baseStartMs: row.startMs,
        baseEndMs: row.endMs,
        variant: cand.variant,
        startMs: cand.startMs,
        endMs: cand.endMs,
        baseText: row.text,
        candText: cand.text,
      });
      return next;
    });
  };
  const removePatch = (rowId: number) =>
    setPatches((prev) => {
      const next = new Map(prev);
      next.delete(rowId);
      return next;
    });
  const setPatchRange = (rowId: number, startMs: number, endMs: number) =>
    setPatches((prev) => {
      const cur = prev.get(rowId);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(rowId, { ...cur, startMs, endMs });
      return next;
    });

  const jobRunning = !!jobId;
  const untranscribed = takes.filter((t) => !t.hasTranscript);

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex items-start gap-2">
          <Scissors className="size-5 mt-0.5 text-primary" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Ghép &amp; vá audio — giữ bản nền tốt nhất, chỉ thay các câu lỗi.
            </p>
            <p className="mt-1 flex items-center gap-1">
              <AlertTriangle className="size-3.5 text-amber-500" />
              Nên vá bằng bản <b>cùng giọng</b> (thường cùng account/lứa gen), nếu
              không mối nối sẽ lệch giọng.
            </p>
          </div>
        </div>
      </Card>

      {/* Takes */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Các bản ({takes.length})</h3>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm hover:bg-muted/50">
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Tải lên bản vá
              <input
                type="file"
                accept="audio/*"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) void uploadTakes(files);
                  e.target.value = "";
                }}
              />
            </label>
            {untranscribed.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={jobRunning || transcribeMut.isPending}
                onClick={() => transcribeMut.mutate(undefined)}
              >
                {jobRunning && jobKind === "transcribe" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mic className="size-4" />
                )}
                Transcribe {untranscribed.length} bản
              </Button>
            )}
          </div>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          Gom các câu cần sửa thành MỘT audio (cùng giọng bản nền) rồi “Tải lên
          bản vá” — nó sẽ được transcribe &amp; dùng như một bản để chọn đoạn vá.
        </p>
        {jobRunning && jobKind === "transcribe" && (
          <p className="mb-2 text-xs text-muted-foreground">
            {jobQ.data?.message ?? "Đang chạy…"} ({jobQ.data?.percent ?? 0}%)
          </p>
        )}
        <div className="space-y-1">
          {takes.map((t) => (
            <div
              key={t.variant}
              className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/40"
            >
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() =>
                  play(`take:${t.variant}`, t.url, 0, t.durationMs)
                }
              >
                {playingKey === `take:${t.variant}` ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </button>
              <span className="font-mono w-20">{t.variant}</span>
              <span className="text-muted-foreground w-16">
                {fmt(t.durationMs)}
              </span>
              {t.isUploaded ? (
                <Badge className="bg-amber-500/80 text-[10px]">bản vá</Badge>
              ) : t.hasTranscript ? (
                <Badge variant="secondary" className="text-[10px]">
                  transcript
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground/60">
                  chưa transcribe
                </span>
              )}
              {base === t.variant && (
                <Badge className="text-[10px]">bản nền</Badge>
              )}
              {t.isUploaded && (
                <button
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  title="Xoá bản vá"
                  onClick={() => deleteTakeMut.mutate(t.variant)}
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Base selector */}
      {transcribed.length > 0 && (
        <Card className="p-4">
          <label className="text-sm font-semibold">Bản nền</label>
          <p className="mb-2 text-xs text-muted-foreground">
            Bản tốt nhất làm gốc. Các câu lỗi sẽ được vá từ bản khác.
          </p>
          <select
            className="w-full rounded border bg-background px-2 py-1.5 text-sm"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          >
            {transcribed.map((t) => (
              <option key={t.variant} value={t.variant}>
                {t.variant} · {fmt(t.durationMs)}
              </option>
            ))}
          </select>
        </Card>
      )}

      {/* Patches summary */}
      {patches.size > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">
            Đoạn sẽ vá ({patches.size})
          </h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Nếu đoạn nguồn dài hơn 1 câu bạn muốn, chỉnh lại giây bắt đầu/kết
            thúc bên dưới rồi ▶ nghe để cắt gọn đúng câu.
          </p>
          <div className="space-y-1.5">
            {[...patches.entries()].map(([rowId, p]) => (
              <div
                key={rowId}
                className="rounded bg-amber-500/10 px-2 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    @{fmt(p.baseStartMs)}
                  </Badge>
                  <span className="flex-1 truncate" title={p.candText}>
                    ← <b>{p.variant}</b>: {p.candText}
                  </span>
                  <button onClick={() => removePatch(rowId)}>
                    <XIcon className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground">nguồn:</span>
                  <input
                    type="number"
                    step="0.1"
                    className="w-16 rounded border bg-background px-1 py-0.5"
                    value={(p.startMs / 1000).toFixed(1)}
                    onChange={(e) =>
                      setPatchRange(
                        rowId,
                        Math.round(Number(e.target.value) * 1000),
                        p.endMs,
                      )
                    }
                  />
                  <span>→</span>
                  <input
                    type="number"
                    step="0.1"
                    className="w-16 rounded border bg-background px-1 py-0.5"
                    value={(p.endMs / 1000).toFixed(1)}
                    onChange={(e) =>
                      setPatchRange(
                        rowId,
                        p.startMs,
                        Math.round(Number(e.target.value) * 1000),
                      )
                    }
                  />
                  <span className="text-muted-foreground">
                    s ({((p.endMs - p.startMs) / 1000).toFixed(1)}s)
                  </span>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      play(
                        `patch:${rowId}`,
                        urlByVariant[p.variant],
                        p.startMs,
                        p.endMs,
                      )
                    }
                  >
                    {playingKey === `patch:${rowId}` ? (
                      <Pause className="size-3.5" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              disabled={jobRunning || buildMut.isPending}
              onClick={() => buildMut.mutate()}
            >
              {jobRunning && jobKind === "build" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              Tạo bản ghép
            </Button>
            {jobRunning && jobKind === "build" && (
              <span className="text-xs text-muted-foreground">
                {jobQ.data?.message ?? "Đang ghép…"}
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Comp result */}
      {compUrl && (
        <Card className="border-primary/40 bg-primary/5 p-4">
          <h3 className="mb-2 text-sm font-semibold">
            Bản ghép{" "}
            {compDurationMs !== null && (
              <span className="font-normal text-muted-foreground">
                · {fmt(compDurationMs)}
              </span>
            )}
          </h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Nghe kỹ các mối nối (chỗ được vá). Nếu ổn → dùng làm bản chính rồi
            render.
          </p>
          <audio src={compUrl} controls className="w-full" />
          <div className="mt-3">
            <Button
              size="sm"
              disabled={promoteMut.isPending}
              onClick={() => promoteMut.mutate()}
            >
              {promoteMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Dùng làm bản chính
            </Button>
            {promoteMut.isSuccess && (
              <span className="ml-2 text-xs text-emerald-600">
                ✓ Đã đặt làm bản chính — sang tab Render để dựng video.
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Align rows */}
      {base && (
        <Card className="p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Câu trong bản nền ({alignQ.data?.rows.length ?? 0})
            </h3>
            {(alignQ.data?.rows.length ?? 0) > 0 && (
              <CopyButton
                label="copy tất cả"
                className="text-xs"
                text={(alignQ.data?.rows ?? [])
                  .map((r) => r.text)
                  .join("\n")}
              />
            )}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            ▶ nghe câu nền. Chỗ nào lỗi → mở ứng viên → nghe → Chọn để vá.
            Sai chính tả → bấm ✎ sửa chữ ngay (ghi vào transcript; nhớ render lại).
            {alignQ.data && alignQ.data.candidateVariants.length === 0 && (
              <span className="text-amber-600">
                {" "}
                Chưa có bản khác đã transcribe để vá — hãy transcribe thêm.
              </span>
            )}
          </p>
          {alignQ.isLoading && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
          <div className="space-y-1.5">
            {alignRows.slice(alignStart, alignStart + ALIGN_PAGE_SIZE).map((row) => (
              <AlignRowView
                key={row.id}
                row={row}
                baseUrl={urlByVariant[base]}
                urlByVariant={urlByVariant}
                patched={patches.has(row.id)}
                play={play}
                playingKey={playingKey}
                onPick={(cand) => addPatch(row, cand)}
                onUnpick={() => removePatch(row.id)}
                onSaveEdit={async (text) => {
                  await api.editCompSentence(
                    episodeName,
                    base,
                    row.startMs,
                    row.endMs,
                    text,
                  );
                  await Promise.all([
                    qc.invalidateQueries({
                      queryKey: ["comp-align", episodeName, base],
                    }),
                    qc.invalidateQueries({ queryKey: ["transcript", episodeName] }),
                    qc.invalidateQueries({ queryKey: ["plan", episodeName] }),
                  ]);
                }}
              />
            ))}
          </div>
          {alignPageCount > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3 text-xs">
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={alignCur === 0}
                onClick={() => setAlignPage(alignCur - 1)}
              >
                ← Trước
              </Button>
              <span className="text-muted-foreground tabular-nums">
                Trang {alignCur + 1}/{alignPageCount} · câu {alignStart + 1}–
                {Math.min(alignStart + ALIGN_PAGE_SIZE, alignRows.length)}/
                {alignRows.length}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={alignCur >= alignPageCount - 1}
                onClick={() => setAlignPage(alignCur + 1)}
              >
                Sau →
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function AlignRowView({
  row,
  baseUrl,
  urlByVariant,
  patched,
  play,
  playingKey,
  onPick,
  onUnpick,
  onSaveEdit,
}: {
  row: CompAlignRow;
  baseUrl: string;
  urlByVariant: Record<string, string>;
  patched: boolean;
  play: (key: string, url: string, s: number, e: number) => void;
  playingKey: string | null;
  onPick: (c: CompAlignCandidate) => void;
  onUnpick: () => void;
  onSaveEdit: (text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.text);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(row.text);
    setEditing(true);
  };
  const save = async () => {
    const next = draft.trim();
    if (saving || next === row.text.trim() || next.length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSaveEdit(next);
      setEditing(false);
    } catch (e) {
      alert(`Lỗi lưu: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className={cn(
        "rounded border px-2 py-1.5 text-sm",
        patched ? "border-amber-500/50 bg-amber-500/10" : "border-transparent",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => play(`base:${row.id}`, baseUrl, row.startMs, row.endMs)}
        >
          {playingKey === `base:${row.id}` ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </button>
        <span className="w-12 shrink-0 font-mono text-[11px] text-muted-foreground">
          {fmt(row.startMs)}
        </span>
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              disabled={saving}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setEditing(false);
              }}
              className="flex-1 rounded border bg-background px-2 py-0.5 text-sm"
            />
            <button
              className="mt-0.5 shrink-0 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
              onClick={() => void save()}
              disabled={saving}
              title="Lưu (Enter)"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
            </button>
            <button
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
              onClick={() => setEditing(false)}
              disabled={saving}
              title="Huỷ (Esc)"
            >
              <XIcon className="size-4" />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1">{row.text}</span>
            <button
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary"
              onClick={startEdit}
              title="Sửa chính tả"
            >
              <Pencil className="size-3.5" />
            </button>
            <CopyButton text={row.text} className="mt-0.5 shrink-0" />
            {patched ? (
              <button
                className="shrink-0 text-xs text-amber-600 hover:underline"
                onClick={onUnpick}
              >
                bỏ vá
              </button>
            ) : (
              <button
                className="shrink-0 text-xs text-primary hover:underline"
                onClick={() => setOpen((v) => !v)}
              >
                vá ▾
              </button>
            )}
          </>
        )}
      </div>

      {open && !patched && (
        <div className="ml-6 mt-1.5 space-y-1 border-l pl-3">
          {row.candidates.map((c) => (
            <div key={c.variant} className="flex items-start gap-2 text-xs">
              <button
                className="mt-0.5 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  play(
                    `cand:${row.id}:${c.variant}`,
                    urlByVariant[c.variant],
                    c.startMs,
                    c.endMs,
                  )
                }
              >
                {playingKey === `cand:${row.id}:${c.variant}` ? (
                  <Pause className="size-3.5" />
                ) : (
                  <Play className="size-3.5" />
                )}
              </button>
              <span className="font-mono w-10 shrink-0">{c.variant}</span>
              <Badge
                variant={c.score > 0.6 ? "secondary" : "outline"}
                className="text-[10px]"
              >
                {(c.score * 100).toFixed(0)}%
              </Badge>
              <span className="flex-1 text-muted-foreground">{c.text}</span>
              <button
                className="shrink-0 text-primary hover:underline"
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
              >
                chọn
              </button>
            </div>
          ))}
          {(row.candidates.length === 0 ||
            row.candidates.every((c) => c.score < 0.5)) && (
            <p className="text-[11px] text-amber-600">
              Chưa có bản nào khớp câu này. Gom câu này (cùng các câu lỗi khác)
              thành một audio, “Tải lên bản vá” ở trên, rồi chọn lại ở đây.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
