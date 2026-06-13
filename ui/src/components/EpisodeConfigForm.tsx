import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, AlertCircle } from "lucide-react";
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

          <Field label="Mood override">
            <select
              value={form.moodOverride ?? ""}
              onChange={(e) =>
                update({
                  moodOverride: e.target.value === "" ? null : e.target.value,
                })
              }
              className={cn(
                "flex h-12 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm",
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

        <Field
          label="Đường dẫn BGM"
          hint="Đường dẫn relative tới audio (vd ./assets/bgm/contemplative.mp3). Để trống = không nhạc nền."
        >
          <Input
            value={form.bgm ?? ""}
            onChange={(e) => update({ bgm: e.target.value || null })}
            placeholder="./assets/bgm/..."
          />
        </Field>

        <Field
          label={`Âm lượng BGM: ${form.bgmVolumeDb} dB`}
          hint="-28 dB là mặc định. Ducking 35% khi có lời (xem Phase 7 PLAN)."
        >
          <input
            type="range"
            min={-40}
            max={-10}
            step={1}
            value={form.bgmVolumeDb}
            onChange={(e) =>
              update({ bgmVolumeDb: Number(e.target.value) })
            }
            disabled={!form.bgm}
            className="w-full accent-primary disabled:opacity-40"
          />
        </Field>

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
      </div>
    </Card>
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
