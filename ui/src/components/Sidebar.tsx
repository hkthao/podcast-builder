import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Mic2,
  Home,
  Library,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { api, type EpisodeStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  getTheme,
  setTheme,
  subscribeTheme,
  type Theme,
} from "@/lib/theme";

export function Sidebar() {
  const { data } = useQuery({
    queryKey: ["episodes"],
    queryFn: () => api.listEpisodes(),
  });
  const location = useLocation();

  const recent = data?.episodes.slice(0, 8) ?? [];

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

      <nav className="p-3 space-y-0.5">
        <NavItem to="/" icon={<Home className="size-4" />} label="Episodes" />
        <NavItem
          to="/references"
          icon={<Library className="size-4" />}
          label="References"
        />
      </nav>

      <div className="px-5 py-2 text-xs uppercase tracking-wider text-muted-foreground">
        Recent
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
          return (
            <NavLink
              key={ep.name}
              to={path}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                "hover:bg-secondary",
                active && "bg-secondary text-foreground font-medium",
              )}
              title={ep.config.title}
            >
              <StatusDot status={ep.status} />
              <span className="truncate">{ep.config.title || ep.name}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="border-t p-3">
        <ThemeSwitcher />
      </div>
    </aside>
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
