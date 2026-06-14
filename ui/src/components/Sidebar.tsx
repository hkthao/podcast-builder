import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Mic2,
  Home,
  Library,
  Lightbulb,
  FileText,
  Workflow as WorkflowIcon,
  Network,
  Image as ImageIcon,
  Film,
  Compass,
  Star,
  Mic,
  Frame,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sun,
  Moon,
  Monitor,
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
import { useWorkspace, type Workspace } from "@/lib/workspace";

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspace, setWorkspace } = useWorkspace();
  const { data } = useQuery({
    queryKey: ["episodes", workspace],
    queryFn: () => api.listEpisodes(workspace),
  });
  const [pinned, setPinned] = usePersistedState<string[]>(
    "sidebar.pinned",
    [],
  );

  // Items chỉ thuộc 1 workspace — switch sang workspace khác mà đang ở page
  // đó → navigate về "/" (tránh user kẹt ở page không thuộc workspace).
  const WORKSPACE_ONLY_PATHS: Record<Workspace, string[]> = {
    podcast: ["/scenes"],
    gallery: ["/research"],
  };
  const switchWorkspace = (next: Workspace) => {
    if (next === workspace) return;
    setWorkspace(next);
    const otherWorkspacePaths =
      WORKSPACE_ONLY_PATHS[next === "podcast" ? "gallery" : "podcast"];
    if (otherWorkspacePaths.some((p) => location.pathname.startsWith(p))) {
      navigate("/");
    }
  };
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

      {/* Workspace switcher — top-level team toggle */}
      <div className="px-3 pt-3 pb-2 border-b">
        <div className="flex items-center gap-1 p-1 rounded-md border bg-secondary/30">
          <WorkspaceButton
            value="podcast"
            current={workspace}
            onClick={() => switchWorkspace("podcast")}
            icon={<Mic className="size-3.5" />}
            label="Podcast"
          />
          <WorkspaceButton
            value="gallery"
            current={workspace}
            onClick={() => switchWorkspace("gallery")}
            icon={<Frame className="size-3.5" />}
            label="Gallery"
          />
        </div>
      </div>

      <nav className="p-3 space-y-3">
        {/* Group 1: Chung — overview + shared pre-prod */}
        <div className="space-y-0.5">
          <SectionLabel>Chung</SectionLabel>
          <NavItem to="/" icon={<Home className="size-4" />} label="Tập" />
          <NavItem
            to="/workflow"
            icon={<WorkflowIcon className="size-4" />}
            label="Workflow"
          />
          <NavItem
            to="/brainstorm"
            icon={<Lightbulb className="size-4" />}
            label="Brainstorm"
          />
          <NavItem
            to="/essay"
            icon={<FileText className="size-4" />}
            label="Bài luận"
          />
        </div>

        {/* Group 2: Library chung — cross-style */}
        <div className="space-y-0.5">
          <SectionLabel>Thư viện chung</SectionLabel>
          <NavItem
            to="/references"
            icon={<Library className="size-4" />}
            label="Tài liệu"
          />
          <NavItem
            to="/knowledge"
            icon={<Network className="size-4" />}
            label="Tri thức"
          />
          <NavItem
            to="/visual"
            icon={<ImageIcon className="size-4" />}
            label="Hình ảnh ý tưởng"
          />
        </div>

        {/* Production group — chỉ hiện workspace tương ứng */}
        {workspace === "podcast" && (
          <div className="space-y-0.5">
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <Mic className="size-3" />
                Podcast — Production
              </span>
            </SectionLabel>
            <NavItem
              to="/scenes"
              icon={<Film className="size-4" />}
              label="Scene templates"
            />
          </div>
        )}

        {workspace === "gallery" && (
          <div className="space-y-0.5">
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <Frame className="size-3" />
                Gallery Art — Production
              </span>
            </SectionLabel>
            <NavItem
              to="/research"
              icon={<Compass className="size-4" />}
              label="Research assets"
            />
          </div>
        )}
      </nav>

      <div className="px-3 pt-3 pb-1 border-t mt-1">
        <SectionLabel>
          {pinnedEps.length > 0 ? "Pinned + Recent" : "Tập gần đây"}
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

function WorkspaceButton({
  value,
  current,
  onClick,
  icon,
  label,
}: {
  value: Workspace;
  current: Workspace;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 inline-flex items-center justify-center gap-1.5 rounded h-7 text-xs font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
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
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end
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
