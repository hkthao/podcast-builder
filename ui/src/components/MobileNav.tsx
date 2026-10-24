/**
 * Thanh điều hướng đáy cho điện thoại (< md): 4 màn hay dùng (menu đầy đủ: nút ☰ trên AppBar).
 * Badge = số job render / đăng đang chạy (cùng queryKey với trang hàng đợi → không gọi API thừa).
 */
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clapperboard, LayoutList, UploadCloud } from "lucide-react";
import type { ReactNode } from "react";
import { api, publishApi } from "@/lib/api";
import { isActiveJob } from "@/pages/RenderQueue";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const location = useLocation();
  const renderQ = useQuery({
    queryKey: ["render-jobs"],
    queryFn: () => api.listRenderJobs(),
    refetchInterval: (q) => (q.state.data?.jobs.some((j) => isActiveJob(j.status)) ? 3000 : 15000),
  });
  const publishQ = useQuery({
    queryKey: ["publish-jobs"],
    queryFn: () => publishApi.list(),
    refetchInterval: (q) => (q.state.data?.jobs.some((j) => j.status === "queued" || j.status === "uploading") ? 3000 : 30_000),
  });
  const renderN = (renderQ.data?.jobs ?? []).filter((j) => isActiveJob(j.status)).length;
  const pubN = (publishQ.data?.jobs ?? []).filter((j) => j.status === "queued" || j.status === "uploading").length;
  // "Tập" sáng ở mọi danh sách kênh + trang tập.
  const onEpisodes = location.pathname === "/" || location.pathname.startsWith("/series/") || location.pathname.startsWith("/episodes/");

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <Item to="/" icon={<LayoutList className="size-5" />} label="Tập" active={onEpisodes} />
      <Item to="/plan" icon={<CalendarDays className="size-5" />} label="Kế hoạch" />
      <Item to="/render-queue" icon={<Clapperboard className="size-5" />} label="Render" badge={renderN} />
      <Item to="/publish-queue" icon={<UploadCloud className="size-5" />} label="Đăng" badge={pubN} />
    </nav>
  );
}

function Item({ to, icon, label, badge, active }: { to: string; icon: ReactNode; label: string; badge?: number; active?: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "relative flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground",
          (active ?? isActive) && "font-medium text-accent",
        )
      }
    >
      <span className="relative">
        {icon}
        {!!badge && (
          <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-accent-foreground">
            {badge}
          </span>
        )}
      </span>
      {label}
    </NavLink>
  );
}
