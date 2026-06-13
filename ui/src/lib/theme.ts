/**
 * Theme manager: light / dark / system. Copy từ family-tree-v3.
 * State trong localStorage. `.dark` class trên <html>.
 */

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "podcast-builder:theme";

type Listener = (t: Theme) => void;
const listeners = new Set<Listener>();
let mediaQuery: MediaQueryList | null = null;

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private mode */
  }
  return "system";
}

function effectiveDark(t: Theme): boolean {
  if (t === "dark") return true;
  if (t === "light") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(t: Theme): void {
  if (typeof document === "undefined") return;
  const dark = effectiveDark(t);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function getTheme(): Theme {
  return readStored();
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
  apply(t);
  for (const l of listeners) l(t);
}

export function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function initTheme(): void {
  if (typeof window === "undefined") return;
  const t = readStored();
  apply(t);
  if (!mediaQuery) {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", () => {
      if (readStored() === "system") apply("system");
    });
  }
}
