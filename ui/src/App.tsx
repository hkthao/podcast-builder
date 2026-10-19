import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { EpisodeList, SeriesEpisodeList } from "./pages/EpisodeList";
import { EpisodeEdit } from "./pages/EpisodeEdit";
import { ReferenceList } from "./pages/ReferenceList";
import { Brainstorm } from "./pages/Brainstorm";
import { EssayPage } from "./pages/Essay";
import { KnowledgePage } from "./pages/Knowledge";
import { VisualPage } from "./pages/Visual";
import { ScenesPage } from "./pages/Scenes";
import { SettingsPage } from "./pages/Settings";
import { PromptsPage } from "./pages/Prompts";
import { CommentsPage } from "./pages/Comments";
import { PlanPage } from "./pages/Plan";
import { RenderQueuePage } from "./pages/RenderQueue";
import { PublishQueuePage } from "./pages/PublishQueue";
import { CleanupPage } from "./pages/Cleanup";
import { useEpisodesChangedSync } from "./lib/sse";

export function App() {
  useEpisodesChangedSync();
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<EpisodeList series="bytecast" />} />
          <Route path="/series/:series" element={<SeriesEpisodeList />} />
          <Route path="/episodes/:name" element={<EpisodeEdit />} />
          <Route path="/references" element={<ReferenceList />} />
          <Route path="/brainstorm" element={<Brainstorm />} />
          <Route path="/essay" element={<EssayPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/visual" element={<VisualPage />} />
          <Route path="/scenes" element={<ScenesPage />} />
          <Route path="/comments" element={<CommentsPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/render-queue" element={<RenderQueuePage />} />
          <Route path="/publish-queue" element={<PublishQueuePage />} />
          <Route path="/cleanup" element={<CleanupPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/prompts" element={<PromptsPage />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}
