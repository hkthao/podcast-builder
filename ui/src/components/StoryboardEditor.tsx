/**
 * StoryboardEditor — Documentary direction Phase 5 (drag-drop timeline).
 *
 * Modal overlay cho user edit shots trong storyboard chapter dạng timeline
 * trực quan (thay vì list-based ShotsEditor sẵn có).
 *
 * Layout 3 hàng:
 *  - Header: title + Mix bar (assetType ratio) + Pacing warning
 *  - Timeline strip: shots dạng card mã màu, width-proportional theo duration,
 *    drag-drop horizontal để đổi sentenceIdx
 *  - Inspector: form edit shot đang select (keyword, role, assetType, kenBurns,
 *    aiPrompt, note)
 *
 * Drag-drop semantics (HTML5 native):
 *  - Drag shot card → onDragOver trigger trên shot khác → drop = swap sentenceIdx
 *  - Sau swap, shots re-sort theo sentenceIdx ascending
 *  - Đơn giản hoá V1: swap pair only. V2 có thể support drop vào sentence empty.
 */
import { useMemo, useState, useEffect } from "react";
import {
  ASSET_TYPES,
  type AssetType,
  KEN_BURNS_MODES,
  type KenBurnsMode,
  SHOT_ROLES,
  type ShotRole,
} from "../../../gallery/src/shot";
import type { Shot } from "@/lib/api";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Archive,
  Camera,
  Palette,
  Sparkles,
  X,
  Save,
  Loader2,
  AlertCircle,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Color + icon per assetType ───────────────────────────────────────────

const ASSET_META: Record<
  AssetType,
  { label: string; icon: typeof Archive; bg: string; ring: string; text: string }
> = {
  archive: {
    label: "Archive",
    icon: Archive,
    bg: "bg-amber-500/15",
    ring: "ring-amber-500/50",
    text: "text-amber-700 dark:text-amber-300",
  },
  stock: {
    label: "Stock",
    icon: Camera,
    bg: "bg-emerald-500/15",
    ring: "ring-emerald-500/50",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  ai: {
    label: "AI",
    icon: Sparkles,
    bg: "bg-violet-500/15",
    ring: "ring-violet-500/50",
    text: "text-violet-700 dark:text-violet-300",
  },
  motion: {
    label: "Motion",
    icon: Palette,
    bg: "bg-sky-500/15",
    ring: "ring-sky-500/50",
    text: "text-sky-700 dark:text-sky-300",
  },
};

const UNCLASSIFIED_META = {
  label: "?",
  bg: "bg-muted/40",
  ring: "ring-muted-foreground/30",
  text: "text-muted-foreground",
};

const ROLE_LABEL: Record<ShotRole, string> = {
  establishing: "Establishing",
  subject: "Subject",
  detail: "Detail",
  concept: "Concept",
  transition: "Transition",
  payoff: "Payoff",
};

// ── Mix bar computation ──────────────────────────────────────────────────

function computeMix(shots: Shot[]): {
  counts: Record<AssetType | "?", number>;
  total: number;
} {
  const counts: Record<AssetType | "?", number> = {
    archive: 0,
    stock: 0,
    ai: 0,
    motion: 0,
    "?": 0,
  };
  for (const s of shots) {
    counts[s.assetType ?? "?"]++;
  }
  return { counts, total: shots.length };
}

function computePacingWarnings(shots: Shot[]): Array<{
  fromIdx: number;
  toIdx: number;
  assetType: AssetType | "?";
  runLength: number;
}> {
  const warnings: Array<{
    fromIdx: number;
    toIdx: number;
    assetType: AssetType | "?";
    runLength: number;
  }> = [];
  if (shots.length < 3) return warnings;
  let runStart = 0;
  let currentType: AssetType | "?" = shots[0].assetType ?? "?";
  for (let i = 1; i <= shots.length; i++) {
    // Sentinel cho hết mảng: flush run cuối cùng bằng cách dùng giá trị không
    // tồn tại trong enum (kiểu rộng hơn nhẹ — cast về AssetType|"?" để index
    // table dùng key thật bên trong if(runLength≥4)).
    const t = (
      i < shots.length ? (shots[i].assetType ?? "?") : "__END__"
    ) as AssetType | "?";
    if (t !== currentType) {
      const runLength = i - runStart;
      if (runLength >= 4) {
        warnings.push({
          fromIdx: runStart,
          toIdx: i - 1,
          assetType: currentType,
          runLength,
        });
      }
      runStart = i;
      currentType = t as AssetType | "?";
    }
  }
  return warnings;
}

// ── Estimated duration for timeline card width ───────────────────────────

function estimateDurationMs(
  shot: Shot,
  nextShot: Shot | null,
  sentenceCount: number,
  audioDurationMs: number,
): number {
  if (shot.durationMs !== null) return shot.durationMs;
  if (audioDurationMs <= 0 || sentenceCount === 0) return 5000;
  // Linear estimate: each sentence ≈ audioDuration / sentenceCount.
  // Shot duration = (next.sentenceIdx - this.sentenceIdx) * sentenceMs.
  const sentenceMs = audioDurationMs / sentenceCount;
  const nextStartIdx = nextShot ? nextShot.sentenceIdx : sentenceCount;
  return Math.max(1000, (nextStartIdx - shot.sentenceIdx) * sentenceMs);
}

// ── Editor component ─────────────────────────────────────────────────────

export type StoryboardEditorProps = {
  chapterTitle: string;
  chapterIdx: number;
  initialShots: Shot[];
  transcript: string;
  audioDurationMs: number;
  onSave: (shots: Shot[]) => void;
  onClose: () => void;
  saving: boolean;
};

export function StoryboardEditor({
  chapterTitle,
  chapterIdx,
  initialShots,
  transcript,
  audioDurationMs,
  onSave,
  onClose,
  saving,
}: StoryboardEditorProps) {
  const [shots, setShots] = useState<Shot[]>(() =>
    [...initialShots].sort((a, b) => a.sentenceIdx - b.sentenceIdx),
  );
  const [selectedIdx, setSelectedIdx] = useState<number | null>(
    shots.length > 0 ? 0 : null,
  );
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  const sentenceCount = useMemo(
    () =>
      transcript
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter(Boolean).length,
    [transcript],
  );
  const sentences = useMemo(
    () =>
      transcript
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [transcript],
  );

  const mix = useMemo(() => computeMix(shots), [shots]);
  const pacingWarnings = useMemo(() => computePacingWarnings(shots), [shots]);

  // Width-proportional cards: total ms = audio length; each card width =
  // (estimatedDurationMs / totalMs) * timelineWidth. Min 80px for readability.
  const timelineWidthPx = Math.max(800, shots.length * 80);
  const totalEstMs = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < shots.length; i++) {
      sum += estimateDurationMs(
        shots[i],
        shots[i + 1] ?? null,
        sentenceCount,
        audioDurationMs,
      );
    }
    return sum > 0 ? sum : 1;
  }, [shots, sentenceCount, audioDurationMs]);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dirty) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, onClose]);

  const updateShot = (idx: number, patch: Partial<Shot>) => {
    setShots((prev) => {
      const next = prev.map((s, i) => (i === idx ? { ...s, ...patch } : s));
      // Re-sort if sentenceIdx changed
      const sorted = [...next].sort(
        (a, b) => a.sentenceIdx - b.sentenceIdx,
      );
      // Track new index of edited shot to keep selection
      if (patch.sentenceIdx !== undefined) {
        const updated = next[idx];
        const newIdx = sorted.findIndex((s) => s === updated);
        if (newIdx >= 0) setSelectedIdx(newIdx);
      }
      return sorted;
    });
    setDirty(true);
  };

  const deleteShot = (idx: number) => {
    if (!window.confirm(`Xoá shot #${idx + 1}?`)) return;
    setShots((prev) => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
    setDirty(true);
  };

  // Drag-drop: swap sentenceIdx of dragged + drop target → re-sort.
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDraggingIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    // Required for Firefox drag to work
    e.dataTransfer.setData("text/plain", String(idx));
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    if (draggingIdx === null || draggingIdx === idx) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  };
  const handleDragLeave = () => {
    setDragOverIdx(null);
  };
  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggingIdx === null || draggingIdx === targetIdx) return;
    setShots((prev) => {
      const next = [...prev];
      const a = next[draggingIdx];
      const b = next[targetIdx];
      const tmp = a.sentenceIdx;
      next[draggingIdx] = { ...a, sentenceIdx: b.sentenceIdx };
      next[targetIdx] = { ...b, sentenceIdx: tmp };
      return next.sort((x, y) => x.sentenceIdx - y.sentenceIdx);
    });
    setDirty(true);
    setDraggingIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => {
    setDraggingIdx(null);
    setDragOverIdx(null);
  };

  const handleSave = () => {
    onSave(shots);
  };

  const handleCloseAttempt = () => {
    if (
      dirty &&
      !window.confirm("Có thay đổi chưa lưu. Đóng anyway?")
    ) {
      return;
    }
    onClose();
  };

  const selectedShot = selectedIdx !== null ? shots[selectedIdx] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={handleCloseAttempt}
    >
      <Card
        className="w-full max-w-6xl max-h-[95vh] overflow-y-auto p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium text-base flex-1">
            <span className="text-muted-foreground">Storyboard:</span>{" "}
            {chapterTitle}{" "}
            <span className="text-xs text-muted-foreground font-mono">
              · chapter #{String(chapterIdx + 1).padStart(2, "0")}
            </span>
          </h3>
          <Badge variant="outline" className="text-xs font-mono">
            {shots.length} shots
          </Badge>
          {dirty && (
            <Badge
              variant="outline"
              className="text-xs gap-1 text-amber-700 border-amber-500/40"
            >
              <AlertCircle className="size-3" />
              Có thay đổi
            </Badge>
          )}
          <button
            type="button"
            onClick={handleCloseAttempt}
            className="p-1 rounded hover:bg-secondary"
            title="Đóng (Esc)"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Mix bar */}
        <MixBar mix={mix} />

        {/* Pacing warnings */}
        {pacingWarnings.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
            <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
            <span>
              Pacing: {pacingWarnings.length} chuỗi shot cùng loại quá dài.
              {pacingWarnings.map((w, i) => (
                <span key={i} className="ml-2">
                  #{w.fromIdx + 1}-#{w.toIdx + 1} ({w.runLength}× {w.assetType})
                </span>
              ))}
            </span>
          </div>
        )}

        {/* Timeline strip */}
        <div className="rounded-md border bg-muted/30 p-2 overflow-x-auto">
          <div
            className="flex gap-1 items-stretch"
            style={{ minWidth: timelineWidthPx }}
          >
            {shots.length === 0 ? (
              <div className="text-xs text-muted-foreground p-4 text-center w-full">
                Chưa có shot nào. Đóng modal và bấm "Auto-fill" trong panel
                Shots editor để LLM tạo, hoặc add shot thủ công.
              </div>
            ) : (
              shots.map((shot, i) => {
                const widthPct =
                  (estimateDurationMs(
                    shot,
                    shots[i + 1] ?? null,
                    sentenceCount,
                    audioDurationMs,
                  ) /
                    totalEstMs) *
                  100;
                return (
                  <ShotCard
                    key={i}
                    shot={shot}
                    idx={i}
                    selected={selectedIdx === i}
                    dragging={draggingIdx === i}
                    dropTarget={dragOverIdx === i}
                    widthPct={widthPct}
                    onSelect={() => setSelectedIdx(i)}
                    onDragStart={(e) => handleDragStart(e, i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Inspector */}
        {selectedShot !== null && selectedIdx !== null ? (
          <Inspector
            shot={selectedShot}
            shotIdx={selectedIdx}
            sentences={sentences}
            sentenceCount={sentenceCount}
            onUpdate={(patch) => updateShot(selectedIdx, patch)}
            onDelete={() => deleteShot(selectedIdx)}
          />
        ) : (
          <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            Click 1 shot trên timeline để edit.
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCloseAttempt}
            disabled={saving}
          >
            Đóng
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save shots
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function MixBar({
  mix,
}: {
  mix: { counts: Record<AssetType | "?", number>; total: number };
}) {
  if (mix.total === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground text-center">
        No shots
      </div>
    );
  }
  // Build stacked segments
  const segments: Array<{ type: AssetType | "?"; pct: number; count: number }> =
    [];
  for (const t of [...ASSET_TYPES, "?" as const]) {
    const count = mix.counts[t] ?? 0;
    if (count === 0) continue;
    segments.push({
      type: t,
      pct: (count / mix.total) * 100,
      count,
    });
  }
  return (
    <div>
      <div className="flex h-3 w-full rounded overflow-hidden border">
        {segments.map((seg, i) => {
          const meta =
            seg.type === "?"
              ? UNCLASSIFIED_META
              : ASSET_META[seg.type as AssetType];
          return (
            <div
              key={i}
              className={cn(meta.bg)}
              style={{ width: `${seg.pct}%` }}
              title={`${seg.type}: ${seg.count} shots`}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] font-mono text-muted-foreground flex-wrap">
        {segments.map((seg, i) => {
          const meta =
            seg.type === "?"
              ? UNCLASSIFIED_META
              : ASSET_META[seg.type as AssetType];
          return (
            <span key={i} className="inline-flex items-center gap-1">
              <span
                className={cn("size-2 rounded-full", meta.bg)}
                style={{ outline: "1px solid currentColor" }}
              />
              <span className={meta.text}>
                {meta.label} {seg.count}
              </span>
            </span>
          );
        })}
        <span className="text-muted-foreground/60">· total {mix.total}</span>
      </div>
    </div>
  );
}

function ShotCard({
  shot,
  idx,
  selected,
  dragging,
  dropTarget,
  widthPct,
  onSelect,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  shot: Shot;
  idx: number;
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  widthPct: number;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const meta = shot.assetType
    ? ASSET_META[shot.assetType]
    : UNCLASSIFIED_META;
  const Icon = shot.assetType ? ASSET_META[shot.assetType].icon : Archive;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={cn(
        "group cursor-pointer rounded-md border-2 p-2 min-w-[80px] flex flex-col gap-1 transition-all",
        meta.bg,
        selected ? `${meta.ring} ring-2 border-current ${meta.text}` : "border-transparent hover:border-current/30",
        dragging && "opacity-40",
        dropTarget && "ring-2 ring-primary border-primary scale-105",
      )}
      style={{ width: `${widthPct}%`, minWidth: 80 }}
      title={`#${idx + 1}: ${shot.keyword}`}
    >
      <div className="flex items-center gap-1 text-[10px] font-mono">
        <GripVertical className="size-3 opacity-30 group-hover:opacity-60 cursor-grab" />
        <span className={cn(meta.text, "shrink-0")}>
          #{String(idx + 1).padStart(2, "0")}
        </span>
        <Icon className={cn("size-3 ml-auto", meta.text)} />
      </div>
      <div className={cn("text-[10px] truncate", meta.text)}>
        {shot.role ? (ROLE_LABEL[shot.role] ?? shot.role) : "—"}
      </div>
      <div className="text-[11px] line-clamp-2 text-foreground/80">
        {shot.keyword || "(no keyword)"}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground mt-auto">
        s{shot.sentenceIdx}
      </div>
    </div>
  );
}

function Inspector({
  shot,
  shotIdx,
  sentences,
  sentenceCount,
  onUpdate,
  onDelete,
}: {
  shot: Shot;
  shotIdx: number;
  sentences: string[];
  sentenceCount: number;
  onUpdate: (patch: Partial<Shot>) => void;
  onDelete: () => void;
}) {
  const sentencePreview = sentences[shot.sentenceIdx]?.slice(0, 100) ?? "(out of range)";
  return (
    <div className="rounded-md border bg-background p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          Shot #{String(shotIdx + 1).padStart(2, "0")}
        </span>
        <Badge variant="outline" className="text-[10px] font-mono">
          sentence {shot.sentenceIdx}/{sentenceCount - 1}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 text-destructive hover:bg-destructive/10"
          onClick={onDelete}
        >
          <X className="size-3.5" />
          Xoá shot
        </Button>
      </div>

      {/* Sentence preview */}
      <div className="rounded bg-muted/30 p-2">
        <div className="text-[10px] text-muted-foreground mb-0.5">
          Câu narration tại sentenceIdx {shot.sentenceIdx}:
        </div>
        <div className="text-xs italic">"{sentencePreview}…"</div>
      </div>

      {/* Form grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">
            Sentence index
          </Label>
          <input
            type="number"
            min={0}
            max={Math.max(0, sentenceCount - 1)}
            value={shot.sentenceIdx}
            onChange={(e) =>
              onUpdate({
                sentenceIdx: Math.max(
                  0,
                  Math.min(sentenceCount - 1, Number(e.target.value)),
                ),
              })
            }
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm font-mono"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">
            Duration override (ms)
          </Label>
          <input
            type="number"
            min={0}
            placeholder="auto"
            value={shot.durationMs ?? ""}
            onChange={(e) =>
              onUpdate({
                durationMs:
                  e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
              })
            }
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm font-mono"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Role</Label>
          <select
            value={shot.role}
            onChange={(e) => onUpdate({ role: e.target.value as ShotRole })}
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {SHOT_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Asset type</Label>
          <select
            value={shot.assetType ?? ""}
            onChange={(e) =>
              onUpdate({
                assetType: (e.target.value || undefined) as
                  | AssetType
                  | undefined,
              })
            }
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">(unclassified)</option>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSET_META[t].label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">Keyword</Label>
          <input
            type="text"
            value={shot.keyword}
            onChange={(e) => onUpdate({ keyword: e.target.value })}
            placeholder="Vd: Giotto Lamentation full fresco"
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Ken Burns</Label>
          <select
            value={shot.kenBurns}
            onChange={(e) =>
              onUpdate({ kenBurns: e.target.value as KenBurnsMode })
            }
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {KEN_BURNS_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Transition in</Label>
          <select
            value={shot.transitionIn ?? ""}
            onChange={(e) =>
              onUpdate({
                transitionIn:
                  (e.target.value || undefined) as Shot["transitionIn"],
              })
            }
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">(auto by role)</option>
            <option value="cut">cut</option>
            <option value="crossfade">crossfade</option>
            <option value="fadeblack">fadeblack</option>
            <option value="whippan">whippan</option>
          </select>
        </div>
        {shot.assetType === "ai" && (
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">
              AI Prompt (Draw Things)
            </Label>
            <Textarea
              value={shot.aiPrompt ?? ""}
              onChange={(e) => onUpdate({ aiPrompt: e.target.value })}
              rows={3}
              className="mt-1 text-xs"
              placeholder="Mô tả cảnh AI gen, vd: Giotto in workshop, 14th century Florence…"
            />
          </div>
        )}
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">Note</Label>
          <input
            type="text"
            value={shot.note}
            onChange={(e) => onUpdate({ note: e.target.value })}
            placeholder="Optional asset team note"
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
