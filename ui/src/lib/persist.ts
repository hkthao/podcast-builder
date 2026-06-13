import { useEffect, useState } from "react";

/**
 * useState + auto-sync localStorage. Restore lần đầu mount, write
 * mỗi khi state đổi. SSR-safe (check typeof window).
 *
 * KHÔNG dùng cho dữ liệu sensitive — localStorage clear-text.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota exceeded — ignore */
    }
  }, [key, value]);

  return [value, setValue];
}
