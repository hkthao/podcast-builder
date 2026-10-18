import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Keyboard, Lightbulb, Monitor, Moon, Settings as SettingsIcon, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { SERIES_OPTIONS, seriesInfo } from "@/lib/series";
import { cn } from "@/lib/utils";
import { getTheme, setTheme, subscribeTheme, type Theme } from "@/lib/theme";
import { OPEN_SHORTCUTS_EVENT } from "./ShortcutsHelp";

const TOOL_PAGES: Record<string, string> = {
  "/plan": "Kế hoạch đăng",
  "/render-queue": "Hàng đợi render",
  "/cleanup": "Dọn ổ cứng",
  "/comments": "Comment Facebook",
  "/scenes": "Mẫu cảnh podcast",
  "/references": "Tham khảo",
  "/brainstorm": "Brainstorm",
  "/essay": "Bài luận",
  "/knowledge": "Kiến thức",
  "/visual": "Hình ảnh",
};

/** Breadcrumb theo route: [nhóm, trang]. */
function useCrumbs(): string[] {
  const { pathname } = useLocation();
  const { data } = useQuery({ queryKey: ["episodes", "podcast"], queryFn: () => api.listEpisodes("podcast") });
  if (pathname === "/") return ["Kênh", seriesInfo("bytecast").channelName];
  if (pathname.startsWith("/series/")) {
    const id = pathname.slice("/series/".length);
    const known = SERIES_OPTIONS.some((s) => s.id === id);
    return ["Kênh", known ? seriesInfo(id as (typeof SERIES_OPTIONS)[number]["id"]).channelName : id];
  }
  if (pathname.startsWith("/episodes/")) {
    const name = decodeURIComponent(pathname.slice("/episodes/".length));
    const ep = data?.episodes.find((e) => e.name === name);
    return [seriesInfo(ep?.config.series ?? "bytecast").channelName, ep?.config.title || name];
  }
  if (pathname === "/settings") return ["Hệ thống", "Settings"];
  if (pathname === "/prompts") return ["Hệ thống", "System prompts"];
  if (TOOL_PAGES[pathname]) return ["Công cụ", TOOL_PAGES[pathname]];
  return [];
}

/** Thanh trên cùng: breadcrumb trái, tiện ích hệ thống phải (phím tắt, prompts, giao diện, settings). */
export function AppBar() {
  const crumbs = useCrumbs();
  return (
    <header className="z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-card/80 px-6 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <nav aria-label="Vị trí" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />}
            <span className={cn("truncate", i === crumbs.length - 1 ? "font-medium" : "text-muted-foreground")}>{c}</span>
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-1">
        <BarButton label="Phím tắt (?)" onClick={() => window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))}>
          <Keyboard className="size-4" />
        </BarButton>
        <BarLink to="/prompts" label="System prompts">
          <Lightbulb className="size-4" />
        </BarLink>
        <ThemeMenu />
        <span className="mx-1 h-5 w-px bg-border" />
        <BarLink to="/settings" label="Settings">
          <SettingsIcon className="size-4" />
        </BarLink>
      </div>
    </header>
  );
}

const btn = "grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

function BarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={btn}>
      {children}
    </button>
  );
}

function BarLink({ to, label, children }: { to: string; label: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      title={label}
      aria-label={label}
      className={({ isActive }) => cn(btn, isActive && "bg-secondary text-foreground")}
    >
      {children}
    </NavLink>
  );
}

const THEMES: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
  { value: "system", label: "Theo hệ thống", icon: Monitor },
];

function ThemeMenu() {
  const [theme, setLocal] = useState<Theme>(() => getTheme());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => subscribeTheme(setLocal), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const Current = THEMES.find((t) => t.value === theme)?.icon ?? Monitor;
  return (
    <div ref={ref} className="relative">
      <BarButton label="Giao diện" onClick={() => setOpen((v) => !v)}>
        <Current className="size-4" />
      </BarButton>
      {open && (
        <div role="menu" className="absolute right-0 top-11 w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
          {THEMES.map((t) => (
            <button
              key={t.value}
              role="menuitemradio"
              aria-checked={theme === t.value}
              onClick={() => {
                setTheme(t.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-secondary",
                theme === t.value && "bg-secondary font-medium",
              )}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
