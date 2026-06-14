import { streamSSE } from "hono/streaming";
import type { Context } from "hono";
import { bus } from "./events";

/**
 * Mở SSE stream cho Hono context. Subscribe các event từ `bus`, format theo
 * spec text/event-stream, gửi keepalive 15s tránh proxy drop.
 *
 * Lifecycle:
 *   - Frontend connect → subscribe
 *   - Frontend disconnect → cleanup listener + clear keepalive
 *
 * Events forward: `episodes:changed` (Phase 10.1), `render:progress` (Phase 10.4).
 */
export function sseFromBus(c: Context) {
  return streamSSE(c, async (stream) => {
    // Initial hello
    let id = 0;
    await stream.writeSSE({
      event: "hello",
      data: JSON.stringify({ ts: Date.now() }),
      id: String(++id),
    });

    const queue: Array<{ event: string; data: unknown }> = [];
    let resume: (() => void) | null = null;
    const wake = () => {
      if (resume) {
        const r = resume;
        resume = null;
        r();
      }
    };
    const push = (event: string, data: unknown) => {
      queue.push({ event, data });
      wake();
    };

    const onChange = (ev: unknown) => push("episodes:changed", ev);
    const onProgress = (ev: unknown) => push("render:progress", ev);
    const onGalleryProgress = (ev: unknown) =>
      push("gallery-render:progress", ev);
    bus.on("episodes:changed", onChange);
    bus.on("render:progress", onProgress);
    bus.on("gallery-render:progress", onGalleryProgress);

    const ping = setInterval(() => push("ping", { ts: Date.now() }), 15_000);
    let aborted = false;
    stream.onAbort(() => {
      aborted = true;
      clearInterval(ping);
      bus.off("episodes:changed", onChange);
      bus.off("render:progress", onProgress);
      bus.off("gallery-render:progress", onGalleryProgress);
      wake();
    });

    try {
      while (!aborted) {
        // Drain queue
        while (queue.length > 0) {
          const msg = queue.shift()!;
          await stream.writeSSE({
            event: msg.event,
            data: JSON.stringify(msg.data),
            id: String(++id),
          });
        }
        // Wait for next event
        await new Promise<void>((resolve) => {
          resume = resolve;
        });
      }
    } finally {
      clearInterval(ping);
      bus.off("episodes:changed", onChange);
      bus.off("render:progress", onProgress);
      bus.off("gallery-render:progress", onGalleryProgress);
    }
  });
}
