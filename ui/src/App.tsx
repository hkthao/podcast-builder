import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { EpisodeList } from "./pages/EpisodeList";
import { EpisodeEdit } from "./pages/EpisodeEdit";
import { ReferenceList } from "./pages/ReferenceList";
import { Brainstorm } from "./pages/Brainstorm";
import { EssayPage } from "./pages/Essay";
import { WorkflowPage } from "./pages/Workflow";
import { KnowledgePage } from "./pages/Knowledge";
import { VisualPage } from "./pages/Visual";
import { ScenesPage } from "./pages/Scenes";
import { ResearchPage } from "./pages/Research";
import { GalleryPlanPage } from "./pages/GalleryPlan";
import { SettingsPage } from "./pages/Settings";
import { useEpisodesChangedSync } from "./lib/sse";
import { WorkspaceProvider } from "./lib/workspace";

export function App() {
  useEpisodesChangedSync();
  return (
    <BrowserRouter>
      <WorkspaceProvider>
        <AppLayout>
        <Routes>
          <Route path="/" element={<EpisodeList />} />
          <Route path="/episodes/:name" element={<EpisodeEdit />} />
          <Route path="/references" element={<ReferenceList />} />
          <Route path="/brainstorm" element={<Brainstorm />} />
          <Route path="/essay" element={<EssayPage />} />
          <Route path="/workflow" element={<WorkflowPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/visual" element={<VisualPage />} />
          <Route path="/scenes" element={<ScenesPage />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/gallery/plans/:id" element={<GalleryPlanPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        </AppLayout>
      </WorkspaceProvider>
    </BrowserRouter>
  );
}
