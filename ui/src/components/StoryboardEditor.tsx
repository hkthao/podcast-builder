/**
 * StoryboardEditor — inline drag-drop timeline cho shots trong storyboard chapter.
 *
 * Sau khi đổi tên Plan→Storyboard / VisualBeat→Shot (Phase 5), đây là UI
 * chính để user sắp xếp shots trong 1 chapter narration. Thay thế hoàn toàn
 * ShotsEditor list view cũ.
 *
 * Layout 3 hàng:
 *  - Header: title + Mix bar (assetType ratio) + Pacing warnings
 *  - Timeline strip: shots dạng card mã màu, width-proportional theo
 *    duration, drag-drop horizontal để swap sentenceIdx
 *  - Inspector: form edit shot đang select (sentenceIdx, keyword, role,
 *    assetType, kenBurns, transitionIn, aiPrompt khi assetType=ai, note)
 *    + Asset slot render prop (do parent inject BeatAssetSlot)
 *
 * Save semantics: controlled component — mỗi edit gọi onChange ngay, parent
 * debounce/save (saveMut.mutate). Không có internal dirty state.
 *
 * Drag-drop semantics (HTML5 native):
 *  - Drag shot card → onDragOver trigger trên shot khác → drop = swap
 *    sentenceIdx → re-sort theo sentenceIdx ascending.
 */
import type React from "react";
import { useMemo, useState } from "react";
import {
  ASSET_TYPES,
  type AssetType,
  KEN_BURNS_MODES,
  type KenBurnsMode,
  SHOT_ROLES,
  type ShotRole,
  TRANSITIONS,
  type Transition,
} from "../../../gallery/src/shot";
import type { Shot } from "@/lib/api";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Archive,
  Camera,
  Palette,
  Sparkles,
  Loader2,
  AlertCircle,
  GripVertical,
  Plus,
  Trash2,
  ChevronDown,
  ImageIcon,
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

// ── Mix computation ──────────────────────────────────────────────────────

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
    const t = (
      i < shots.length ? (shots[i].assetType ?? "?") : "__END__"
    ) as AssetType | "?";
    if (t !== currentType) {
      const runLength = i - runStart;
      // Chỉ cảnh báo chuỗi CÙNG LOẠI THẬT — bỏ qua "?" (shot chưa set assetType,
      // không phải "cùng loại" mà chỉ là chưa cấu hình → cảnh báo gây nhiễu).
      if (runLength >= 4 && currentType !== "?") {
        warnings.push({
          fromIdx: runStart,
          toIdx: i - 1,
          assetType: currentType,
          runLength,
        });
      }
      runStart = i;
      currentType = t;
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
  const sentenceMs = audioDurationMs / sentenceCount;
  const nextStartIdx = nextShot ? nextShot.sentenceIdx : sentenceCount;
  return Math.max(1000, (nextStartIdx - shot.sentenceIdx) * sentenceMs);
}

// ── Auto-fill helper ─────────────────────────────────────────────────────

const KEN_BURNS_ROTATION: KenBurnsMode[] = [
  "zoom-in",
  "pan-right",
  "zoom-out",
  "pan-left",
  "zoom-in",
  "pan-up",
];

function autoFillShots(
  existing: Shot[],
  sentenceCount: number,
  keywordSuggestions: string[],
): Shot[] | null {
  // Target ~1 shot mỗi 2.5 câu (6-12s mỗi ảnh tại 160 wpm). Min 3 shot.
  const targetCount = Math.max(3, Math.round(sentenceCount / 2.5));
  const needed = targetCount - existing.length;
  if (needed <= 0) return null;
  const existingIdxs = new Set(existing.map((s) => s.sentenceIdx));
  const keywordPool =
    keywordSuggestions.length > 0 ? keywordSuggestions : [""];
  const stride = Math.max(1, sentenceCount / targetCount);
  const added: Shot[] = [];
  for (let i = 0; i < targetCount && added.length < needed; i++) {
    const idx = Math.min(
      sentenceCount - 1,
      Math.max(0, Math.round(i * stride)),
    );
    if (existingIdxs.has(idx)) continue;
    existingIdxs.add(idx);
    added.push({
      sentenceIdx: idx,
      keyword: keywordPool[added.length % keywordPool.length] ?? "",
      assetIdRef: null,
      kenBurns: KEN_BURNS_ROTATION[added.length % KEN_BURNS_ROTATION.length],
      durationMs: null,
      note: "",
    });
  }
  if (added.length === 0) return null;
  return [...existing, ...added].sort((a, b) => a.sentenceIdx - b.sentenceIdx);
}

// ── Editor ───────────────────────────────────────────────────────────────

export type StoryboardEditorProps = {
  shots: Shot[];
  transcript: string;
  sentenceCount: number;
  audioDurationMs: number;
  keywordSuggestions: string[];
  saving: boolean;
  onChange: (shots: Shot[]) => void;
  /** Render prop cho asset slot — parent (GalleryStoryboard) inject
   * BeatAssetSlot vì component này gắn liền asset library state. */
  renderAssetSlot?: (
    shot: Shot,
    onPatch: (patch: Partial<Shot>) => void,
  ) => React.ReactNode;
};

export function StoryboardEditor({
  shots,
  transcript,
  sentenceCount,
  audioDurationMs,
  keywordSuggestions,
  saving,
  onChange,
  renderAssetSlot,
}: StoryboardEditorProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(
    shots.length > 0 ? 0 : null,
  );
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);

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

  const staleShots = shots.filter(
    (s) => s.sentenceIdx < 0 || s.sentenceIdx >= sentenceCount,
  );

  const timelineWidthPx = Math.max(800, shots.length * 90);
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

  const targetCount = Math.max(3, Math.round(sentenceCount / 2.5));

  // ── Mutations (controlled — call onChange immediately) ───────────────

  const sortedSave = (next: Shot[]) =>
    onChange([...next].sort((a, b) => a.sentenceIdx - b.sentenceIdx));

  const updateShot = (idx: number, patch: Partial<Shot>) => {
    const next = shots.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    if (patch.sentenceIdx !== undefined) {
      // Track edited shot after sort to keep selection
      const updated = next[idx];
      const sorted = [...next].sort((a, b) => a.sentenceIdx - b.sentenceIdx);
      const newIdx = sorted.findIndex((s) => s === updated);
      if (newIdx >= 0) setSelectedIdx(newIdx);
      onChange(sorted);
    } else {
      onChange(next);
    }
  };

  const deleteShot = (idx: number) => {
    if (!window.confirm(`Xoá shot #${idx + 1}?`)) return;
    setSelectedIdx(null);
    onChange(shots.filter((_, i) => i !== idx));
  };

  const addShot = () => {
    const lastIdx =
      shots.length > 0 ? shots[shots.length - 1].sentenceIdx : -1;
    const newIdx = Math.min(lastIdx + 2, Math.max(0, sentenceCount - 1));
    sortedSave([
      ...shots,
      {
        sentenceIdx: newIdx,
        keyword: "",
        assetIdRef: null,
        kenBurns: "zoom-in",
        durationMs: null,
        note: "",
        // Default thật để shot mới không hiện "?" + lint pacing chạy đúng.
        role: "detail",
        assetType: "stock",
      },
    ]);
  };

  const handleAutoFill = () => {
    const filled = autoFillShots(shots, sentenceCount, keywordSuggestions);
    if (filled) onChange(filled);
  };

  // ── Drag-drop: swap sentenceIdx of dragged + drop target → re-sort ───

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDraggingIdx(idx);
    e.dataTransfer.effectAllowed = "move";
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
    const next = [...shots];
    const a = next[draggingIdx];
    const b = next[targetIdx];
    const tmp = a.sentenceIdx;
    next[draggingIdx] = { ...a, sentenceIdx: b.sentenceIdx };
    next[targetIdx] = { ...b, sentenceIdx: tmp };
    sortedSave(next);
    setDraggingIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => {
    setDraggingIdx(null);
    setDragOverIdx(null);
  };

  const selectedShot = selectedIdx !== null ? shots[selectedIdx] : null;

  return (
    <div className="mt-5 border-t pt-4">
      {/* Header — expand toggle + summary */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 text-sm font-medium hover:text-accent transition-colors"
      >
        <ImageIcon className="size-4" />
        Storyboard ({shots.length} shots)
        {staleShots.length > 0 && (
          <Badge
            variant="outline"
            className="ml-1 text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
          >
            {staleShots.length} stale
          </Badge>
        )}
        {saving && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-normal ml-2">
            <Loader2 className="size-3 animate-spin" />
            Đang lưu…
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground font-normal">
          ~1 ảnh/
          {Math.max(1, Math.round(sentenceCount / Math.max(1, shots.length)))}{" "}
          câu
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform shrink-0",
            expanded && "rotate-180",
          )}
        />
      </button>

      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
        Kéo thả các shot trên timeline để đổi thứ tự (swap sentenceIdx). Click
        1 shot để edit chi tiết trong Inspector bên dưới.
        {sentenceCount > 0 && (
          <>
            {" "}Chương dài <strong>{sentenceCount} câu</strong> → gợi ý khoảng{" "}
            <strong>{targetCount} shot</strong> ({shots.length} hiện có).
          </>
        )}
      </p>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Mix bar — assetType distribution */}
          <MixBar mix={mix} />

          {/* Pacing warnings */}
          {pacingWarnings.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              <span>
                Pacing: {pacingWarnings.length} chuỗi shot cùng loại quá dài.
                {pacingWarnings.map((w, i) => (
                  <span key={i} className="ml-2">
                    #{w.fromIdx + 1}-#{w.toIdx + 1} ({w.runLength}×{" "}
                    {w.assetType})
                  </span>
                ))}
              </span>
            </div>
          )}

          {/* Timeline strip — drag-drop */}
          <div className="rounded-md border bg-muted/30 p-2 overflow-x-auto">
            {shots.length === 0 ? (
              <div className="text-xs text-muted-foreground p-4 text-center">
                Chưa có shot nào. Bấm <strong>"Tự fill"</strong> để hệ thống
                sinh sẵn ~{targetCount} shot scaffold, hoặc{" "}
                <strong>"Thêm shot"</strong> để thêm từng cái.
              </div>
            ) : (
              <div
                className="flex gap-1 items-stretch"
                style={{ minWidth: timelineWidthPx }}
              >
                {shots.map((shot, i) => {
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
                })}
              </div>
            )}
          </div>

          {/* Inspector for selected shot */}
          {selectedShot !== null && selectedIdx !== null ? (
            <Inspector
              shot={selectedShot}
              shotIdx={selectedIdx}
              sentences={sentences}
              sentenceCount={sentenceCount}
              keywordSuggestions={keywordSuggestions}
              onUpdate={(patch) => updateShot(selectedIdx, patch)}
              onDelete={() => deleteShot(selectedIdx)}
              disabled={saving}
              renderAssetSlot={renderAssetSlot}
            />
          ) : (
            shots.length > 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                Click 1 shot trên timeline để edit.
              </div>
            )
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={handleAutoFill}
              disabled={
                saving || sentenceCount === 0 || shots.length >= targetCount
              }
              title={
                shots.length >= targetCount
                  ? `Đã đủ ${shots.length}/${targetCount} shot`
                  : `Sinh thêm ${targetCount - shots.length} shot scaffold`
              }
            >
              <Sparkles className="size-3.5" />
              Tự fill ~{targetCount} shot
              {shots.length > 0 && shots.length < targetCount && (
                <span className="text-muted-foreground font-normal">
                  {" "}(+{targetCount - shots.length})
                </span>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={addShot}
              disabled={saving || sentenceCount === 0}
            >
              <Plus className="size-3.5" />
              Thêm shot
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function MixBar({
  mix,
}: {
  mix: { counts: Record<AssetType | "?", number>; total: number };
}) {
  if (mix.total === 0) return null;
  const segments: Array<{ type: AssetType | "?"; pct: number; count: number }> =
    [];
  for (const t of [...ASSET_TYPES, "?" as const]) {
    const count = mix.counts[t] ?? 0;
    if (count === 0) continue;
    segments.push({ type: t, pct: (count / mix.total) * 100, count });
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
          Asset mix
        </span>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-mono">
          {segments.map((s) => {
            const meta = s.type === "?" ? UNCLASSIFIED_META : ASSET_META[s.type];
            return (
              <span key={s.type} className={cn("inline-flex", meta.text)}>
                {meta.label}={s.count}
              </span>
            );
          })}
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden flex">
        {segments.map((s) => {
          const meta = s.type === "?" ? UNCLASSIFIED_META : ASSET_META[s.type];
          return (
            <div
              key={s.type}
              className={cn(meta.bg, "h-full")}
              style={{ width: `${s.pct}%` }}
              title={`${meta.label}: ${s.count} (${s.pct.toFixed(0)}%)`}
            />
          );
        })}
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
  const meta = shot.assetType ? ASSET_META[shot.assetType] : UNCLASSIFIED_META;
  const Icon =
    shot.assetType && ASSET_META[shot.assetType]
      ? ASSET_META[shot.assetType].icon
      : ImageIcon;
  return (
    <button
      type="button"
      draggable
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative flex flex-col items-stretch text-left rounded border p-1.5 transition-all shrink-0 outline-none",
        meta.bg,
        selected
          ? cn("ring-2", meta.ring, "border-primary shadow-sm")
          : "border-border hover:border-primary/50",
        dragging && "opacity-40 cursor-grabbing",
        dropTarget && "ring-2 ring-primary border-primary scale-105",
      )}
      style={{ width: `${widthPct}%`, minWidth: 86 }}
      title={`#${idx + 1}: ${shot.keyword}`}
    >
      <div className="flex items-center gap-1 text-[10px] font-mono">
        <GripVertical className="size-3 opacity-30 group-hover:opacity-60 cursor-grab" />
        <span className={cn(meta.text, "shrink-0")}>
          #{String(idx + 1).padStart(2, "0")}
        </span>
        <Icon className={cn("size-3 ml-auto", meta.text)} />
      </div>
      <div className={cn("text-[10px] truncate mt-0.5", meta.text)}>
        {shot.role ? ROLE_LABEL[shot.role] : "—"}
      </div>
      <div className="text-[10px] text-foreground/80 truncate mt-0.5">
        {shot.keyword || (
          <span className="italic text-muted-foreground">(no keyword)</span>
        )}
      </div>
      <div className="text-[9px] text-muted-foreground font-mono mt-auto pt-0.5">
        s{shot.sentenceIdx}
      </div>
    </button>
  );
}

function Inspector({
  shot,
  shotIdx,
  sentences,
  sentenceCount,
  keywordSuggestions,
  onUpdate,
  onDelete,
  disabled,
  renderAssetSlot,
}: {
  shot: Shot;
  shotIdx: number;
  sentences: string[];
  sentenceCount: number;
  keywordSuggestions: string[];
  onUpdate: (patch: Partial<Shot>) => void;
  onDelete: () => void;
  disabled: boolean;
  renderAssetSlot?: (
    shot: Shot,
    onPatch: (patch: Partial<Shot>) => void,
  ) => React.ReactNode;
}) {
  const stale = shot.sentenceIdx < 0 || shot.sentenceIdx >= sentenceCount;
  const sentencePreview =
    !stale && sentences[shot.sentenceIdx]
      ? sentences[shot.sentenceIdx]
      : "(stale — câu không còn trong transcript)";
  return (
    <div className="rounded-md border bg-background p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium">
          Shot #{String(shotIdx + 1).padStart(2, "0")}
          {stale && (
            <Badge
              variant="outline"
              className="ml-2 text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30"
            >
              stale
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={disabled}
          className="h-7 text-red-600 hover:text-red-700 hover:bg-red-500/10"
        >
          <Trash2 className="size-3.5" />
          Xoá
        </Button>
      </div>

      <div className="rounded bg-muted/40 px-2 py-1.5 text-[11px] italic text-muted-foreground">
        s{shot.sentenceIdx}: "{sentencePreview}"
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider">
            Sentence index
          </Label>
          <input
            type="number"
            min={0}
            max={Math.max(0, sentenceCount - 1)}
            value={shot.sentenceIdx}
            onChange={(e) =>
              onUpdate({ sentenceIdx: Math.max(0, Number(e.target.value)) })
            }
            disabled={disabled}
            className="h-8 w-full rounded border border-input bg-background px-2 text-xs font-mono"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider">Role</Label>
          <select
            value={shot.role ?? ""}
            onChange={(e) =>
              onUpdate({
                role: e.target.value
                  ? (e.target.value as ShotRole)
                  : undefined,
              })
            }
            disabled={disabled}
            className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
          >
            <option value="">— chưa chọn —</option>
            {SHOT_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider">
            Asset type
          </Label>
          <select
            value={shot.assetType ?? ""}
            onChange={(e) =>
              onUpdate({
                assetType: e.target.value
                  ? (e.target.value as AssetType)
                  : undefined,
              })
            }
            disabled={disabled}
            className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
          >
            <option value="">— chưa chọn —</option>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSET_META[t].label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider">
            Ken Burns
          </Label>
          <select
            value={shot.kenBurns}
            onChange={(e) =>
              onUpdate({ kenBurns: e.target.value as KenBurnsMode })
            }
            disabled={disabled}
            className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
          >
            {KEN_BURNS_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider">
            Transition (vào shot này)
          </Label>
          <select
            value={shot.transitionIn ?? ""}
            onChange={(e) =>
              onUpdate({
                transitionIn: e.target.value
                  ? (e.target.value as Transition)
                  : undefined,
              })
            }
            disabled={disabled}
            className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
          >
            <option value="">— default theo role —</option>
            {TRANSITIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider">
            Keyword
          </Label>
          <input
            type="text"
            value={shot.keyword}
            onChange={(e) => onUpdate({ keyword: e.target.value })}
            disabled={disabled}
            placeholder="vd: Padua chapel 1305"
            list={`shot-${shotIdx}-keyword-suggestions`}
            className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
          />
          {keywordSuggestions.length > 0 && (
            <datalist id={`shot-${shotIdx}-keyword-suggestions`}>
              {keywordSuggestions.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          )}
        </div>
      </div>

      {shot.assetType === "ai" && (
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider">
            AI prompt (Draw Things)
          </Label>
          <Textarea
            value={shot.aiPrompt ?? ""}
            onChange={(e) => onUpdate({ aiPrompt: e.target.value })}
            disabled={disabled}
            placeholder="Padua workshop, 14th century, oil on tempera panel, museum lighting"
            rows={2}
            className="text-xs"
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider">Note</Label>
        <Textarea
          value={shot.note}
          onChange={(e) => onUpdate({ note: e.target.value })}
          disabled={disabled}
          placeholder="Ghi chú cho shot này"
          rows={2}
          className="text-xs"
        />
      </div>

      {/* Asset slot — parent injects BeatAssetSlot for library pin/picker */}
      {renderAssetSlot && renderAssetSlot(shot, onUpdate)}
    </div>
  );
}
