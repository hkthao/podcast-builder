import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Keyboard, X } from "lucide-react";
import { useShortcuts } from "@/lib/shortcuts";
import { Card } from "@/components/ui/card";

/**
 * Global keyboard shortcuts component — mounted ở AppLayout.
 * - `?` = mở help modal
 * - `g e/b/r/w/k/v/y` = navigate (vim style)
 * - Escape khi modal mở = close
 */
export function ShortcutsHelp() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  useShortcuts([
    {
      key: "?",
      shift: true,
      label: "Mở keyboard shortcuts",
      fn: () => setOpen((v) => !v),
    },
    {
      key: "Escape",
      label: "Đóng modal",
      fn: () => {
        if (open) setOpen(false);
        if (pendingG) setPendingG(false);
      },
    },
    {
      key: "g",
      label: "Prefix — bấm kế tiếp e/b/r/w/k/v/y để navigate",
      fn: () => {
        setPendingG(true);
        setTimeout(() => setPendingG(false), 1500);
      },
    },
    {
      key: "/",
      label: "Focus search (trang có search)",
      fn: () => {
        const el = document.querySelector<HTMLInputElement>(
          "[data-search]",
        );
        if (el) {
          el.focus();
          el.select();
        }
      },
    },
  ]);

  // Sub-handler cho "g X" sequence
  useEffect(() => {
    if (!pendingG) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable)
          return;
      }
      const map: Record<string, string> = {
        e: "/",
        b: "/brainstorm",
        s: "/essay",
        r: "/references",
        k: "/knowledge",
        v: "/visual",
      };
      const path = map[e.key.toLowerCase()];
      if (path) {
        e.preventDefault();
        navigate(path);
      }
      setPendingG(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingG, navigate]);

  return (
    <>
      {pendingG && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-foreground text-background text-sm font-mono shadow-lg z-50">
          g _ (e/b/s/r/w/k/v)
        </div>
      )}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <Card
            className="max-w-2xl w-full p-0 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-3 border-b bg-secondary/30 flex items-center gap-2">
              <Keyboard className="size-5 text-accent" />
              <h2 className="font-medium">Keyboard shortcuts</h2>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto p-1 rounded hover:bg-secondary"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              <ShortcutGroup
                title="Navigation"
                items={[
                  ["g e", "Episodes"],
                  ["g b", "Brainstorm (gallery)"],
                  ["g s", "Essay"],
                  ["g r", "References"],
                  ["g k", "Knowledge"],
                  ["g v", "Visual library"],
                ]}
              />
              <ShortcutGroup
                title="Actions"
                items={[
                  ["/", "Focus search (trang có search)"],
                  ["n", "New (essay/brainstorm/ref tuỳ trang)"],
                  ["Esc", "Đóng modal / huỷ form"],
                  ["?", "Mở help (this modal)"],
                ]}
              />
              <ShortcutGroup
                title="Trong essay editor"
                items={[
                  ["⌘ Enter", "Save scene edit"],
                  ["Esc", "Cancel edit"],
                ]}
              />
            </div>
            <div className="px-6 py-3 border-t text-xs text-muted-foreground">
              Phím trong input bị ignore (trừ Esc).
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function ShortcutGroup({
  title,
  items,
}: {
  title: string;
  items: Array<[string, string]>;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </p>
      {items.map(([keys, label]) => (
        <div key={keys} className="flex items-center justify-between py-1">
          <span className="text-sm text-muted-foreground">{label}</span>
          <kbd className="font-mono text-xs px-2 py-0.5 rounded border bg-secondary/50">
            {keys}
          </kbd>
        </div>
      ))}
    </div>
  );
}
