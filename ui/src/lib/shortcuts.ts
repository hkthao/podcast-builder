import { useEffect } from "react";

export type Shortcut = {
  /** Key (single char, lowercase) hoặc special: "/", "?", "Escape" */
  key: string;
  /** Cmd/Ctrl modifier required? */
  meta?: boolean;
  /** Shift modifier required? */
  shift?: boolean;
  /** Mô tả ngắn cho help modal */
  label: string;
  /** Handler */
  fn: (e: KeyboardEvent) => void;
};

const isEditingTarget = (el: EventTarget | null): boolean => {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
};

/**
 * Register global keyboard shortcuts. Tự skip khi focus đang ở input/textarea
 * (TRỪ "Escape" — luôn fire).
 */
export function useShortcuts(shortcuts: Shortcut[]): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape luôn fire (cho phép close modal/find bar khi đang focus input)
      const isEscape = e.key === "Escape";
      if (!isEscape && isEditingTarget(e.target)) return;
      for (const s of shortcuts) {
        if (s.key !== e.key) continue;
        if (s.meta && !(e.metaKey || e.ctrlKey)) continue;
        if (!s.meta && (e.metaKey || e.ctrlKey)) continue;
        if (s.shift && !e.shiftKey) continue;
        if (!s.shift && e.shiftKey && s.key.length === 1) continue;
        e.preventDefault();
        s.fn(e);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts]);
}

export const formatShortcut = (s: Shortcut): string => {
  const parts: string[] = [];
  if (s.meta) parts.push(navigator.platform.includes("Mac") ? "⌘" : "Ctrl");
  if (s.shift) parts.push("⇧");
  parts.push(s.key === " " ? "Space" : s.key);
  return parts.join(" ");
};
