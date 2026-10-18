import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Mic2,
  Film,
  Network,
  MessageSquare,
  Lightbulb,
  Star,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sun,
  Moon,
  Monitor,
  Settings as SettingsIcon,
  BookOpen,
} from "lucide-react";
import { api, type EpisodeStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/lib/persist";
import {
  getTheme,
  setTheme,
  subscribeTheme,
  type Theme,
} from "@/lib/theme";

export function Sidebar() {
  const location = useLocation();
  const { data } = useQuery({
    queryKey: ["episodes", "podcast"],
    queryFn: () => api.listEpisodes("podcast"),
  });
  const [pinned, setPinned] = usePersistedState<string[]>(
    "sidebar.pinned",
    [],
  );

  const togglePin = (name: string) => {
    setPinned((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };
  const isPinned = (name: string) => pinned.includes(name);

  // Pinned trước, recent sau (loại trùng), tối đa 8
  const allEps = data?.episodes ?? [];
  const pinnedEps = allEps.filter((e) => isPinned(e.name));
  const restEps = allEps
    .filter((e) => !isPinned(e.name))
    .slice(0, Math.max(0, 8 - pinnedEps.length));
  const recent = [...pinnedEps, ...restEps];

  const seriesOf = (ep: { config: { series?: string } }) => ep.config.series ?? "bytecast";
  /** "Podcast · 70 tập" — đang tải thì chỉ hiện loại (tránh "0 tập" chớp lên). */
  const metaOf = (kind: string, series: string) =>
    data ? `${kind} · ${allEps.filter((e) => seriesOf(e) === series).length} tập` : kind;
  // Kênh sáng khi đang ở danh sách của nó HOẶC đang mở 1 tập thuộc kênh đó.
  const openEpName = location.pathname.startsWith("/episodes/")
    ? decodeURIComponent(location.pathname.slice("/episodes/".length))
    : null;
  const openEp = openEpName ? allEps.find((e) => e.name === openEpName) : undefined;
  const channelActive = (series: string) =>
    location.pathname === (series === "bytecast" ? "/" : `/series/${series}`) ||
    (openEp !== undefined && seriesOf(openEp) === series);

  return (
    <aside className="w-64 shrink-0 border-r bg-card flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b">
        <NavLink
          to="/"
          className="flex items-center gap-2 font-serif text-lg font-semibold"
        >
          <Mic2 className="size-6 text-primary" />
          Podcast Studio
        </NavLink>
      </div>

      <nav className="p-3 space-y-4">
        <div className="space-y-1">
          <SectionLabel>Kênh</SectionLabel>
          <ChannelItem
            to="/"
            active={channelActive("bytecast")}
            icon={<Mic2 className="size-4" />}
            tone="bg-primary/15 text-primary"
            name="ByteCast Tech"
            meta={metaOf("Podcast", "bytecast")}
          />
          <ChannelItem
            to="/series/chuyen-xua"
            active={channelActive("chuyen-xua")}
            icon={<BookOpen className="size-4" />}
            tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
            name="Chuyện Xưa - Ngẫm Nay"
            meta={metaOf("Kể chuyện", "chuyen-xua")}
          />
          <ChannelItem
            to="/series/dong-ho-viet"
            active={channelActive("dong-ho-viet")}
            icon={<Network className="size-4" />}
            tone="bg-rose-500/15 text-rose-600 dark:text-rose-400"
            name="Dòng Họ Việt"
            meta={metaOf("Kể chuyện", "dong-ho-viet")}
          />
        </div>
        <div className="space-y-0.5">
          <SectionLabel>Công cụ</SectionLabel>
          <NavItem
            to="/comments"
            icon={<MessageSquare className="size-4" />}
            label="Comment Facebook"
          />
          <NavItem
            to="/scenes"
            icon={<Film className="size-4" />}
            label="Mẫu cảnh podcast"
          />
        </div>
      </nav>

      <div className="px-3 pt-3 pb-1 border-t mt-1">
        <SectionLabel>
          {pinnedEps.length > 0 ? "Đã ghim & gần đây" : "Tập gần đây"}
        </SectionLabel>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
        {recent.length === 0 && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Chưa có tập
          </div>
        )}
        {recent.map((ep) => {
          const path = `/episodes/${encodeURIComponent(ep.name)}`;
          const active = location.pathname === path;
          const pinned = isPinned(ep.name);
          return (
            <div
              key={ep.name}
              className={cn(
                "group flex items-center gap-1 rounded-md text-sm transition-colors",
                "hover:bg-secondary",
                active && "bg-secondary text-foreground font-medium",
              )}
            >
              <NavLink
                to={path}
                className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2"
                title={ep.config.title}
              >
                <StatusDot status={ep.status} />
                <span className="truncate">{ep.config.title || ep.name}</span>
              </NavLink>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  togglePin(ep.name);
                }}
                className={cn(
                  "pr-2.5 py-2 transition-opacity",
                  pinned
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100",
                )}
                title={pinned ? "Bỏ pin" : "Pin episode"}
              >
                <Star
                  className={cn(
                    "size-3.5",
                    pinned
                      ? "text-amber-500 fill-amber-500"
                      : "text-muted-foreground",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-t p-3 space-y-2">
        <NavLink
          to="/prompts"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
              "hover:bg-secondary",
              isActive && "bg-secondary font-medium",
            )
          }
        >
          <Lightbulb className="size-3.5" />
          System prompts
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
              "hover:bg-secondary",
              isActive && "bg-secondary font-medium",
            )
          }
        >
          <SettingsIcon className="size-3.5" />
          Settings
        </NavLink>
        <p
          className="text-xs text-muted-foreground text-center"
          title="Bấm ?"
        >
          Phím tắt:{" "}
          <kbd className="font-mono text-[10px] px-1 py-0.5 rounded border bg-secondary/50">
            ?
          </kbd>
        </p>
        <ThemeSwitcher />
      </div>
    </aside>
  );
}

function ChannelItem({
  to,
  active,
  icon,
  tone,
  name,
  meta,
}: {
  to: string;
  active: boolean;
  icon: React.ReactNode;
  /** Lớp màu ô icon — mỗi kênh 1 màu để nhận ra nhanh. */
  tone: string;
  name: string;
  meta: string;
}) {
  return (
    <NavLink
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors",
        "hover:bg-secondary",
        active && "bg-secondary",
      )}
    >
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", tone)}>{icon}</span>
      <span className="min-w-0">
        <span className={cn("block truncate text-sm", active && "font-medium")}>{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta}</span>
      </span>
    </NavLink>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
      {children}
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  end = true,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          "hover:bg-secondary",
          isActive && "bg-secondary font-medium",
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function StatusDot({ status }: { status: EpisodeStatus }) {
  if (status === "rendered")
    return <CheckCircle2 className="size-3.5 text-accent shrink-0" />;
  if (status === "rendering")
    return <Clock className="size-3.5 text-primary animate-spin shrink-0" />;
  if (status === "outdated")
    return <AlertCircle className="size-3.5 text-muted-foreground shrink-0" />;
  if (status === "no-audio")
    return <AlertCircle className="size-3.5 text-destructive shrink-0" />;
  return <Clock className="size-3.5 text-muted-foreground shrink-0" />;
}

function ThemeSwitcher() {
  const [theme, setLocal] = useState<Theme>(() => getTheme());
  useEffect(() => subscribeTheme(setLocal), []);
  const opts: Array<{ value: Theme; icon: React.ReactNode; label: string }> = [
    { value: "light", icon: <Sun className="size-4" />, label: "Sáng" },
    { value: "dark", icon: <Moon className="size-4" />, label: "Tối" },
    { value: "system", icon: <Monitor className="size-4" />, label: "Hệ thống" },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-md border bg-background p-1">
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => setTheme(o.value)}
          title={o.label}
          aria-label={o.label}
          className={cn(
            "flex items-center justify-center rounded py-1.5 text-muted-foreground transition-colors",
            theme === o.value
              ? "bg-secondary text-foreground"
              : "hover:bg-secondary/50",
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
