import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, Image as ImageIcon, Upload, Trash2 } from "lucide-react";
import { api, type EpisodeSummary, ApiError } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Ảnh cover (intro) theo khung — hiển thị trong tab tương ứng của RenderTab:
 * - VerticalCoverField: cover 9:16 (config.coverImage + coverFit/coverPosition)
 * - LandscapeCoverField: cover 16:9 cho YouTube (config.coverImageLandscape)
 * Upload/xoá ảnh qua API riêng; fit/position lưu thẳng config (form Config đã
 * luôn đồng bộ các field này nên không bị auto-save ghi đè).
 */

/** Cover dọc + lưu fit/position trực tiếp vào config. */
export function VerticalCoverField({ ep }: { ep: EpisodeSummary }) {
  const qc = useQueryClient();
  const saveMut = useMutation({
    mutationFn: (patch: Partial<EpisodeSummary["config"]>) =>
      api.saveEpisodeConfig(ep.name, { ...ep.config, ...patch }),
    onSuccess: (updated) => {
      qc.setQueryData(["episode", ep.name], updated);
      qc.invalidateQueries({ queryKey: ["episodes"] });
    },
  });
  return (
    <CoverField
      ep={ep}
      disabled={!ep.config.showIntro || saveMut.isPending}
      coverFit={ep.config.coverFit}
      coverPosition={ep.config.coverPosition}
      onFitChange={(v) => saveMut.mutate({ coverFit: v })}
      onPositionChange={(v) => saveMut.mutate({ coverPosition: v })}
    />
  );
}

/**
 * Ảnh cover 16:9 cho bản YouTube (input/<slug>.cover-yt.*) — dùng làm intro
 * bản ngang + thumbnail YouTube (output/<slug>.yt.thumb.jpg 1280×720).
 * Chưa có → bản 16:9 dùng cover dọc (contain + nền mờ), thumbnail lấy frame hook.
 */
export function LandscapeCoverField({ ep }: { ep: EpisodeSummary }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onDone = (updated: EpisodeSummary) => {
    qc.setQueryData(["episode", ep.name], updated);
    qc.invalidateQueries({ queryKey: ["episodes"] });
    qc.invalidateQueries({ queryKey: ["episode-files", ep.name] });
    setError(null);
  };
  const onErr = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : String(err));
  const uploadMut = useMutation({
    mutationFn: (file: File) => api.uploadCover(ep.name, file, "landscape"),
    onSuccess: onDone,
    onError: onErr,
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteCover(ep.name, "landscape"),
    onSuccess: onDone,
    onError: onErr,
  });
  const cover = ep.config.coverImageLandscape;
  const coverUrl = cover
    ? `/input/${encodeURIComponent(cover)}?t=${ep.mtimeMs}`
    : null;
  const pending = uploadMut.isPending || deleteMut.isPending;

  return (
    <div className="space-y-1.5 pt-2">
      <Label className="flex items-center gap-2">
        <ImageIcon className="size-4" />
        Ảnh cover YouTube (16:9)
      </Label>
      <p className="text-xs text-muted-foreground">
        Dùng cho intro bản YouTube + làm thumbnail (1280×720). Chưa có → bản
        16:9 dùng ảnh cover dọc của tab Facebook 9:16 (giữ nguyên ảnh, nền mờ hai bên).
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadMut.mutate(file);
          e.target.value = "";
        }}
        disabled={pending}
        className="hidden"
      />
      <div className="rounded-md border p-3 flex items-start gap-3">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="cover YouTube"
            className="w-40 aspect-video rounded border object-cover shrink-0"
          />
        ) : (
          <div className="w-40 aspect-video rounded border border-dashed flex items-center justify-center shrink-0 bg-secondary/30">
            <ImageIcon className="size-5 text-muted-foreground/40" />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm">
            {cover ? (
              <code className="font-mono text-xs">{cover}</code>
            ) : (
              <span className="text-muted-foreground">Chưa có ảnh 16:9</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
            >
              {uploadMut.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {cover ? "Thay ảnh" : "Tải ảnh"}
            </Button>
            {cover && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  if (window.confirm("Xoá ảnh cover YouTube?")) deleteMut.mutate();
                }}
                disabled={pending}
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
    </div>
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

