import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { ServerMonitor } from "./ServerMonitor";
import { ShortcutsHelp } from "./ShortcutsHelp";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden flex flex-col">
        <ServerMonitor />
        <div className="flex-1">{children}</div>
      </main>
      <ShortcutsHelp />
    </div>
  );
}
