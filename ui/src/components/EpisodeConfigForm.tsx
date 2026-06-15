import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, AlertCircle, Image as ImageIcon, Upload, Trash2 } from "lucide-react";
import {
  api,
  type EpisodeConfig,
  type EpisodeSummary,
  ApiError,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SAVE_DEBOUNCE_MS = 500;
const MOODS: Array<{ value: string | null; label: string }> = [
  { value: null, label: "Auto (theo nội dung)" },
  { value: "positive", label: "positive — tích cực" },
  { value: "social", label: "social — kết nối" },
  { value: "healing", label: "healing — chữa lành" },
  { value: "energetic", label: "energetic — năng lượng" },
  { value: "contemplative", label: "contemplative — suy ngẫm" },
];

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Form Config tab — auto-save debounce 500ms.
 *
 * Flow:
 *   - User edit field → setState + status="dirty"
 *   - useEffect resets debounce timer
 *   - Sau 500ms idle → mutate save
 *   - Server response: success → status="saved" → "idle" sau 2s, error → "error"
 *
 * Sync với external changes (SSE từ fs watcher):
 *   - Parent EpisodeEdit nhận mtimeMs mới qua query invalidate
 *   - useEffect listen `ep.mtimeMs` → reset form to latest backend state
 *     (CHỈ khi không dirty — tránh đè đè work user đang edit)
 */
export function EpisodeConfigForm({ ep }: { ep: EpisodeSummary }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<EpisodeConfig>(ep.config);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const lastSavedSnapshot = useRef(JSON.stringify(ep.config));

  const saveMutation = useMutation({
    mutationFn: (cfg: EpisodeConfig) => api.saveEpisodeConfig(ep.name, cfg),
    onSuccess: (updated) => {
      lastSavedSnapshot.current = JSON.stringify(updated.config);
      dirtyRef.current = false;
      setStatus("saved");
      setError(null);
      // Update cache DIRECTLY thay vì invalidate — tránh refetch
      // làm parent re-render + input mất focus khi user đang gõ tiếp.
      qc.setQueryData(["episode", ep.name], updated);
      // Sidebar list cần biết status thay đổi (rendered → outdated):
      // invalidate riêng, không ảnh hưởng form.
      qc.invalidateQueries({ queryKey: ["episodes"] });
      const t = setTimeout(() => setStatus("idle"), 1800);
      return () => clearTimeout(t);
    },
    onError: (err) => {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : String(err));
    },
  });

  // Khi parent refresh ep (vd qua SSE fs watcher), nếu form không dirty → sync.
  useEffect(() => {
    const incoming = JSON.stringify(ep.config);
    if (!dirtyRef.current && incoming !== lastSavedSnapshot.current) {
      lastSavedSnapshot.current = incoming;
      setForm(ep.config);
    }
  }, [ep.mtimeMs, ep.config]);

  // coverImage được quản lý bởi API riêng (upload/delete cover) — không edit qua
  // form fields. Luôn sync vào form state + snapshot ngay cả khi dirty, để
  // auto-save không ghi đè cover về null.
  useEffect(() => {
    setForm((f) => {
      if (f.coverImage === ep.config.coverImage) return f;
      try {
        const snap = JSON.parse(lastSavedSnapshot.current) as EpisodeConfig;
        snap.coverImage = ep.config.coverImage;
        lastSavedSnapshot.current = JSON.stringify(snap);
      } catch {
        /* ignore */
      }
      return { ...f, coverImage: ep.config.coverImage };
    });
  }, [ep.config.coverImage]);

  // Auto-save debounce
  useEffect(() => {
    if (JSON.stringify(form) === lastSavedSnapshot.current) {
      // Không khác bản đã save → idle
      if (status === "dirty") setStatus("idle");
      return;
    }
    dirtyRef.current = true;
    setStatus("dirty");
    const t = setTimeout(() => {
      setStatus("saving");
      saveMutation.mutate(form);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const update = (patch: Partial<EpisodeConfig>) => {
    setForm((f) => ({ ...f, ...patch }));
  };

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Auto-save sau 500ms khi dừng gõ. Sửa rồi click ra để force save.
        </p>
        <SaveIndicator status={status} error={error} />
      </div>

      <div className="space-y-5">
        <Field label="Tiêu đề" required>
          <Input
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Tên tập — vd: Vì sao chúng ta cô đơn giữa đám đông"
            maxLength={200}
          />
        </Field>

        <Field
          label="Hook"
          hint="Câu mở đầu 3.5s sau intro. Để trống → vào thẳng nội dung."
        >
          <Textarea
            value={form.hook ?? ""}
            onChange={(e) => update({ hook: e.target.value || null })}
            placeholder="Câu hỏi/khẳng định gây tò mò — vd: Cho đến khi mất đi, ta mới biết quý."
            rows={2}
            maxLength={200}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Số tập" required>
            <Input
              type="number"
              min={1}
              max={9999}
              value={form.episodeNumber}
              onChange={(e) =>
                update({
                  episodeNumber: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
          </Field>

          <Field label="Tâm trạng (override)">
            <select
              value={form.moodOverride ?? ""}
              onChange={(e) =>
                update({
                  moodOverride: e.target.value === "" ? null : e.target.value,
                })
              }
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              {MOODS.map((m) => (
                <option key={String(m.value)} value={m.value ?? ""}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* BGM (file + volume) đã chuyển sang BgmPanel ngay dưới Meta cards. */}

        <div className="grid grid-cols-2 gap-5 pt-2">
          <SwitchRow
            label="Hiện Intro (3s cover)"
            hint="Tiêu đề hero 3 dòng + emphasis"
            checked={form.showIntro}
            onChange={(v) => update({ showIntro: v })}
          />
          <SwitchRow
            label="Hiện Outro (4s CTA)"
            hint="Logo + 'Theo dõi để xem thêm'"
            checked={form.showOutro}
            onChange={(v) => update({ showOutro: v })}
          />
        </div>

        <CoverField
          ep={ep}
          disabled={!form.showIntro}
          coverFit={form.coverFit}
          coverPosition={form.coverPosition}
          onFitChange={(v) => update({ coverFit: v })}
          onPositionChange={(v) => update({ coverPosition: v })}
        />
      </div>
    </Card>
  );
}

const POSITION_PREVIEW: Record<"top" | "center" | "bottom", string> = {
  top: "center top",
  center: "center center",
  bottom: "center bottom",
};
/** Background nền brand vàng — match COLORS.bg trong src/theme.ts cho preview letterbox. */
const BRAND_BG = "#FFD400";

function CoverField({
  ep,
  disabled,
  coverFit,
  coverPosition,
  onFitChange,
  onPositionChange,
}: {
  ep: EpisodeSummary;
  disabled?: boolean;
  coverFit: "cover" | "contain";
  coverPosition: "top" | "center" | "bottom";
  onFitChange: (v: "cover" | "contain") => void;
  onPositionChange: (v: "top" | "center" | "bottom") => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const uploadMut = useMutation({
    mutationFn: (file: File) => api.uploadCover(ep.name, file),
    onSuccess: (updated) => {
      qc.setQueryData(["episode", ep.name], updated);
      qc.invalidateQueries({ queryKey: ["episodes"] });
      qc.invalidateQueries({ queryKey: ["episode-files", ep.name] });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : String(err));
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteCover(ep.name),
    onSuccess: (updated) => {
      qc.setQueryData(["episode", ep.name], updated);
      qc.invalidateQueries({ queryKey: ["episodes"] });
      qc.invalidateQueries({ queryKey: ["episode-files", ep.name] });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : String(err));
    },
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMut.mutate(file);
    e.target.value = "";
  };

  const coverUrl = ep.config.coverImage
    ? `/input/${encodeURIComponent(ep.config.coverImage)}?t=${ep.mtimeMs}`
    : null;
  const pending = uploadMut.isPending || deleteMut.isPending;

  return (
    <div className="space-y-1.5 pt-2">
      <Label className="flex items-center gap-2">
        <ImageIcon className="size-4" />
        Ảnh cover (intro)
      </Label>
      <p className="text-xs text-muted-foreground">
        Nếu set → IntroCard render ảnh full-frame 3s thay vì auto-gen từ title.
        Hỗ trợ jpg/png/webp. Ratio 9:16 đẹp nhất, ảnh 16:9 sẽ được crop hoặc letterbox theo option dưới.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/*"
        onChange={onPick}
        disabled={pending || disabled}
        className="hidden"
      />
      <div
        className={cn(
          "rounded-md border p-3 space-y-3",
          disabled && "opacity-50",
        )}
      >
        <div className="flex items-start gap-3">
          {coverUrl ? (
            <div
              className="w-[90px] h-40 rounded border shrink-0 overflow-hidden"
              style={{ backgroundColor: BRAND_BG }}
              title="Preview 9:16 đúng tỉ lệ video"
            >
              <img
                src={coverUrl}
                alt="cover preview"
                className="w-full h-full"
                style={{
                  objectFit: coverFit,
                  objectPosition: POSITION_PREVIEW[coverPosition],
                }}
              />
            </div>
          ) : (
            <div className="w-[90px] h-40 rounded border border-dashed flex items-center justify-center shrink-0 bg-secondary/30">
              <ImageIcon className="size-5 text-muted-foreground/40" />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm">
              {ep.config.coverImage ? (
                <code className="font-mono text-xs">{ep.config.coverImage}</code>
              ) : (
                <span className="text-muted-foreground">Chưa có ảnh cover</span>
              )}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={pending || disabled}
              >
                {uploadMut.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {ep.config.coverImage ? "Thay ảnh" : "Tải ảnh"}
              </Button>
              {ep.config.coverImage && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    if (window.confirm("Xoá ảnh cover?")) deleteMut.mutate();
                  }}
                  disabled={pending || disabled}
                >
                  {deleteMut.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Xoá
                </Button>
              )}
            </div>
            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="size-3" />
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Resize/crop options — hiển thị khi có ảnh */}
        {coverUrl && (
          <div className="space-y-2 pt-2 border-t">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Fit mode
              </Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <FitButton
                  active={coverFit === "cover"}
                  onClick={() => onFitChange("cover")}
                  disabled={disabled}
                  label="Cover"
                  hint="Crop để fill 9:16"
                />
                <FitButton
                  active={coverFit === "contain"}
                  onClick={() => onFitChange("contain")}
                  disabled={disabled}
                  label="Contain"
                  hint="Letterbox với nền vàng"
                />
              </div>
            </div>

            <div>
              <Label
                className={cn(
                  "text-xs uppercase tracking-wider text-muted-foreground",
                  coverFit !== "cover" && "opacity-50",
                )}
              >
                Crop position {coverFit !== "cover" && "(chỉ áp dụng cho Cover)"}
              </Label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {(["top", "center", "bottom"] as const).map((pos) => (
                  <FitButton
                    key={pos}
                    active={coverPosition === pos}
                    onClick={() => onPositionChange(pos)}
                    disabled={disabled || coverFit !== "cover"}
                    label={
                      pos === "top" ? "Trên" : pos === "center" ? "Giữa" : "Dưới"
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FitButton({
  active,
  onClick,
  disabled,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md border px-3 py-2 text-sm transition-colors text-left",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-input hover:bg-secondary/40 text-muted-foreground",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      <div className="font-medium">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </button>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <div className="flex-1 min-w-0">
        <Label className="cursor-pointer" onClick={() => onChange(!checked)}>
          {label}
        </Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function SaveIndicator({
  status,
  error,
}: {
  status: SaveStatus;
  error: string | null;
}) {
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Đang lưu…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-accent">
        <Check className="size-4" />
        Đã lưu
      </span>
    );
  }
  if (status === "dirty") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="size-2 rounded-full bg-muted-foreground" />
        Chưa lưu
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-sm text-destructive"
        title={error ?? ""}
      >
        <AlertCircle className="size-4" />
        Lỗi: {error?.slice(0, 60)}
      </span>
    );
  }
  return null;
}
