/**
 * Workspace context — Podcast vs Gallery Art.
 *
 * Mỗi team có workspace riêng. Sidebar + list pages filter theo workspace.
 * State persist trong localStorage key `studio.workspace`.
 *
 * Phase 1 (current): UI-level switcher + sidebar conditional items.
 * Phase 2 (later): DB schema thêm `style` column, API filter, list pages
 *                 auto-filter theo workspace.
 *
 * Cách dùng:
 *   const { workspace, setWorkspace } = useWorkspace();
 *   if (workspace === "gallery") ...
 */
import { createContext, useContext, useEffect, useState } from "react";

export type Workspace = "podcast" | "gallery";

const STORAGE_KEY = "studio.workspace";
const DEFAULT_WORKSPACE: Workspace = "podcast";

const VALID_WORKSPACES: ReadonlyArray<Workspace> = ["podcast", "gallery"];

export function readWorkspace(): Workspace {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (VALID_WORKSPACES as readonly string[]).includes(raw)) {
      return raw as Workspace;
    }
  } catch {
    /* localStorage disabled */
  }
  return DEFAULT_WORKSPACE;
}

export function writeWorkspace(w: Workspace): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, w);
    // Broadcast cho other tabs (giả sử user mở 2 tab)
    window.dispatchEvent(
      new CustomEvent("studio:workspace-changed", { detail: w }),
    );
  } catch {
    /* localStorage disabled */
  }
}

export type WorkspaceContextValue = {
  workspace: Workspace;
  setWorkspace: (next: Workspace) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace>(() =>
    readWorkspace(),
  );

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Workspace>).detail;
      if (detail && VALID_WORKSPACES.includes(detail)) {
        setWorkspaceState(detail);
      }
    };
    // storage event = workspace switched in another tab
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        if ((VALID_WORKSPACES as readonly string[]).includes(e.newValue)) {
          setWorkspaceState(e.newValue as Workspace);
        }
      }
    };
    window.addEventListener("studio:workspace-changed", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("studio:workspace-changed", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setWorkspace = (next: Workspace) => {
    writeWorkspace(next);
    setWorkspaceState(next);
  };

  // Set data-workspace attr trên <html> để CSS có thể style theo workspace
  useEffect(() => {
    document.documentElement.dataset.workspace = workspace;
    return () => {
      delete document.documentElement.dataset.workspace;
    };
  }, [workspace]);

  return (
    <WorkspaceContext.Provider value={{ workspace, setWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be inside <WorkspaceProvider>");
  }
  return ctx;
}

/**
 * Helper — chỉ check workspace match, dùng để show/hide nhanh.
 *   <When workspace="gallery">…</When>
 */
export function isWorkspace(want: Workspace, current: Workspace): boolean {
  return want === current;
}
