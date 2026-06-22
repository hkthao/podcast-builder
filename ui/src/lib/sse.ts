import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RenderProgressEvent } from "./api";

/**
 * Singleton EventSource connection to /api/events.
 * Multiple components subscribe via the bus.
 */

type Listener = (data: unknown) => void;

const listeners = new Map<string, Set<Listener>>();
let eventSource: EventSource | null = null;

function ensureConnection() {
  if (eventSource) return;
  eventSource = new EventSource("/api/events");
  for (const event of [
    "hello",
    "ping",
    "episodes:changed",
    "render:progress",
    "gallery-render:progress",
  ]) {
    eventSource.addEventListener(event, (e) => {
      const msg = (e as MessageEvent).data;
      try {
        const data = JSON.parse(msg);
        listeners.get(event)?.forEach((l) => l(data));
      } catch {
        /* ignore */
      }
    });
  }
  eventSource.onerror = () => {
    // EventSource auto-reconnect
  };
}

export function subscribeSSE<T = unknown>(
  event: string,
  listener: (data: T) => void,
): () => void {
  ensureConnection();
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(listener as Listener);
  return () => {
    listeners.get(event)?.delete(listener as Listener);
  };
}

/**
 * Hook: react-query invalidate on fs changes.
 *
 * KHÔNG invalidate ["episode", name] hoặc ["plan"/"transcript", name] để
 * tránh refetch khi user đang edit form → mất focus input. Form components
 * tự `setQueryData` sau khi save thành công.
 *
 * Chỉ invalidate list ["episodes"] để sidebar/card status badge cập nhật
 * khi file thay đổi từ ngoài (vd $EDITOR, git checkout, render done).
 */
export function useEpisodesChangedSync() {
  const qc = useQueryClient();
  useEffect(() => {
    return subscribeSSE("episodes:changed", () => {
      qc.invalidateQueries({ queryKey: ["episodes"] });
    });
  }, [qc]);
}

/** Hook: subscribe render progress events for a specific job. */
export function useRenderProgress(
  jobId: string | null,
  listener: (progress: RenderProgressEvent) => void,
) {
  useEffect(() => {
    if (!jobId) return;
    return subscribeSSE<RenderProgressEvent>("render:progress", (data) => {
      if (data.jobId === jobId) listener(data);
    });
  }, [jobId, listener]);
}
