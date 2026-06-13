import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { EpisodeList } from "./pages/EpisodeList";
import { EpisodeEdit } from "./pages/EpisodeEdit";
import { ReferenceList } from "./pages/ReferenceList";
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
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}
