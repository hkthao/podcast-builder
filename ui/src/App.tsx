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
import { useEpisodesChangedSync } from "./lib/sse";

export function App() {
  useEpisodesChangedSync();
  return (
    <BrowserRouter>
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
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}
