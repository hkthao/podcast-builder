import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  X,
  Trash2,
  Loader2,
} from "lucide-react";
import { api, type ServerErrorEntry } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Persistent top banner monitor server studio.
 * - Red banner khi /api/health unreachable → server có thể đang chết
 * - Yellow banner khi server OK nhưng có errors trong log persist
 * - Click expand xem stack trace + clear errors
 */
export function ServerMonitor() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const healthQ = useQuery({
    queryKey: ["server-health"],
    queryFn: () => api.getHealth(),
    refetchInterval: 5000,
    retry: false,
    staleTime: 0,
  });

  const clearMut = useMutation({
    mutationFn: () => api.clearServerErrors(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["server-health"] });
      setDismissed(true);
    },
  });

  // Server down: fetch failed
  if (healthQ.isError) {
    return (
      <div className="bg-destructive text-destructive-foreground px-4 py-2 flex items-center gap-3 text-sm sticky top-0 z-50 shadow">
        <AlertOctagon className="size-4 shrink-0" />
        <span className="font-medium">
          Server studio không phản hồi
        </span>
        <span className="text-destructive-foreground/80 text-xs">
          (port 3001) — kiểm tra terminal đang chạy{" "}
          <code className="font-mono">npm run studio</code>?
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          retry mỗi 5s
        </span>
      </div>
    );
  }

  const errors = healthQ.data?.errors ?? [];
  const errorCount = healthQ.data?.errorCount ?? 0;

  if (errorCount === 0 || dismissed) return null;

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/40 text-amber-100 sticky top-0 z-50">
      <div className="px-4 py-2 flex items-center gap-3 text-sm">
        <AlertTriangle className="size-4 shrink-0 text-amber-500" />
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 font-medium hover:underline"
        >
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          {errorCount} server error{errorCount > 1 ? "s" : ""}
          {errors[0] && (
            <span className="ml-2 text-amber-200/70 font-normal">
              · gần nhất: {errors[0].source} —{" "}
              {errors[0].message.slice(0, 80)}
              {errors[0].message.length > 80 ? "…" : ""}
            </span>
          )}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => clearMut.mutate()}
            disabled={clearMut.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-500/20 text-xs"
            title="Xoá log errors"
          >
            {clearMut.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
            Clear
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="inline-flex items-center px-2 py-1 rounded hover:bg-amber-500/20 text-xs"
            title="Ẩn (errors vẫn còn trong log)"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="max-h-80 overflow-y-auto border-t border-amber-500/30 bg-background/95">
          {errors.map((e, idx) => (
            <ErrorRow key={idx} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorRow({ entry }: { entry: ServerErrorEntry }) {
  const [showStack, setShowStack] = useState(false);
  return (
    <div className="px-4 py-2 border-b border-border/50 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "font-mono text-xs px-1.5 py-0.5 rounded",
            entry.source === "uncaught" || entry.source === "rejection"
              ? "bg-destructive/15 text-destructive"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
          )}
        >
          {entry.source}
        </span>
        <span className="text-muted-foreground font-mono">
          {new Date(entry.timestamp).toLocaleTimeString("vi-VN")}
        </span>
        {entry.context?.method && entry.context.path && (
          <span className="font-mono text-muted-foreground">
            {entry.context.method} {entry.context.path}
          </span>
        )}
        {entry.stack && (
          <button
            onClick={() => setShowStack((v) => !v)}
            className="ml-auto text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {showStack ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            stack
          </button>
        )}
      </div>
      <p className="mt-1 text-foreground/90 font-mono whitespace-pre-wrap break-words">
        {entry.message}
      </p>
      {showStack && entry.stack && (
        <pre className="mt-2 p-2 rounded bg-secondary/50 text-[10px] leading-relaxed font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-60 overflow-y-auto">
          {entry.stack}
        </pre>
      )}
    </div>
  );
}
