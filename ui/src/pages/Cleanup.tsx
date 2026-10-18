/**
 * Dọn ổ cứng — ổ hay đầy (render cần ~8GB trống, thiếu là ENOSPC giữa chừng).
 * Route: /cleanup. Chỉ xoá thứ tạo lại được / thuộc tập cũ (logic ở server lib/cleanup.ts).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, HardDrive, Loader2, Trash2 } from "lucide-react";
import { cleanupApi } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const fmtBytes = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)} MB` : `${Math.round(b / 1024)} KB`;

/** Dưới ngưỡng này cảnh báo (render tập dài cần ~8GB scratch + đệm). */
export const LOW_DISK_BYTES = 15 * 1024 ** 3;

export function CleanupPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["cleanup"], queryFn: () => cleanupApi.scan() });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (q.data) setSelected(new Set(q.data.categories.filter((c) => c.defaultSelected && c.bytes > 0).map((c) => c.id)));
  }, [q.data]);

  const runMut = useMutation({
    mutationFn: () => cleanupApi.run([...selected]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cleanup"] });
      qc.invalidateQueries({ queryKey: ["disk"] });
    },
  });

  const disk = runMut.data?.disk ?? q.data?.disk;
  const usedPct = disk ? Math.round(((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100) : 0;
  const selectedBytes = (q.data?.categories ?? []).filter((c) => selected.has(c.id)).reduce((n, c) => n + c.bytes, 0);
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="container max-w-4xl py-10">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-3xl tracking-tight">
          <HardDrive className="size-7 text-accent" /> Dọn ổ cứng
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chỉ xoá thứ tạo lại được hoặc thuộc tập cũ. Không bao giờ đụng footage tự quay, audio đang dùng, kịch bản/config.
        </p>
      </header>

      {disk && (
        <Card className="mb-4 p-4">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span>
              Còn trống <strong className={cn(disk.freeBytes < LOW_DISK_BYTES && "text-destructive")}>{fmtBytes(disk.freeBytes)}</strong> /{" "}
              {fmtBytes(disk.totalBytes)}
            </span>
            <span className="text-xs text-muted-foreground">Render tập dài cần khoảng 8 GB trống — nên giữ trên 15 GB</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", disk.freeBytes < LOW_DISK_BYTES ? "bg-destructive" : "bg-accent")}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </Card>
      )}

      {q.isLoading ? (
        <Card className="h-64 animate-pulse bg-muted/30" />
      ) : q.error ? (
        <Card className="p-4 text-sm text-destructive">{String(q.error)}</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y">
            {q.data!.categories.map((c) => {
              const disabled = c.bytes === 0 || !!c.blockedReason;
              return (
                <label
                  key={c.id}
                  className={cn("flex items-start gap-3 px-4 py-3", disabled ? "opacity-50" : "cursor-pointer hover:bg-muted/30")}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(c.id) && !disabled}
                    disabled={disabled}
                    onChange={() => toggle(c.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="text-xs text-muted-foreground">{c.description}</div>
                    {c.blockedReason && <div className="text-xs text-amber-600 dark:text-amber-400">{c.blockedReason}</div>}
                  </div>
                  <div className="shrink-0 text-right text-sm tabular-nums">
                    <div className={cn(c.bytes > 1024 ** 3 && "font-medium")}>{fmtBytes(c.bytes)}</div>
                    <div className="text-xs text-muted-foreground">{c.count} mục</div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex items-center gap-3 border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">"Tập cũ" = {q.data!.oldEpisodeRule}.</span>
            <Button
              className="ml-auto"
              size="sm"
              disabled={!selectedBytes || runMut.isPending}
              onClick={() => confirm(`Xoá ${fmtBytes(selectedBytes)}? Không hoàn tác được.`) && runMut.mutate()}
            >
              {runMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Dọn {fmtBytes(selectedBytes)}
            </Button>
          </div>
        </Card>
      )}

      {runMut.data && (
        <Card className="mt-4 flex items-center gap-2 p-3 text-sm">
          <CheckCircle2 className="size-4 text-emerald-500" />
          Đã giải phóng {fmtBytes(runMut.data.freedBytes)} ({runMut.data.deleted} mục).
          {runMut.data.skipped.length > 0 && <span className="text-amber-600"> Bỏ qua {runMut.data.skipped.length} mục vì đang render.</span>}
        </Card>
      )}
      {runMut.error && <Card className="mt-4 p-3 text-sm text-destructive">{String(runMut.error)}</Card>}
    </div>
  );
}
