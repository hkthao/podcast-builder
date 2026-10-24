import { type ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { AppBar, TOGGLE_SIDEBAR_EVENT } from "./AppBar";
import { ServerMonitor } from "./ServerMonitor";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { MobileNav } from "./MobileNav";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: ReactNode }) {
  // Màn hình nhỏ (điện thoại): sidebar thành ngăn kéo, mở bằng nút ☰ trên AppBar.
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawer(false), [location.pathname]);
  useEffect(() => {
    const toggle = () => setDrawer((d) => !d);
    window.addEventListener(TOGGLE_SIDEBAR_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_SIDEBAR_EVENT, toggle);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden">
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:static md:z-auto md:translate-x-0",
          drawer ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        )}
      >
        <Sidebar />
      </div>
      {drawer && (
        <button
          type="button"
          aria-label="Đóng menu"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setDrawer(false)}
        />
      )}
      {/* AppBar đứng yên trên cùng; chỉ vùng nội dung bên dưới cuộn. */}
      <main className="flex min-w-0 flex-1 flex-col">
        <AppBar />
        <div id="app-scroll" className="flex-1 overflow-y-auto overflow-x-hidden">
          <ServerMonitor />
          {children}
        </div>
      </main>
      <MobileNav />
      <ShortcutsHelp />
    </div>
  );
}
