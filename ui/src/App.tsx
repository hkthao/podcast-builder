import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { EpisodeList } from "./pages/EpisodeList";
import { EpisodeEdit } from "./pages/EpisodeEdit";
import { ReferenceList } from "./pages/ReferenceList";
import { Brainstorm } from "./pages/Brainstorm";
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
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}
