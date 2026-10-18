import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { AppBar } from "./AppBar";
import { ServerMonitor } from "./ServerMonitor";
import { ShortcutsHelp } from "./ShortcutsHelp";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      {/* AppBar đứng yên trên cùng; chỉ vùng nội dung bên dưới cuộn. */}
      <main className="flex min-w-0 flex-1 flex-col">
        <AppBar />
        <div id="app-scroll" className="flex-1 overflow-y-auto overflow-x-hidden">
          <ServerMonitor />
          {children}
        </div>
      </main>
      <ShortcutsHelp />
    </div>
  );
}
