import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { EpisodeList } from "./pages/EpisodeList";
import { EpisodeEdit } from "./pages/EpisodeEdit";
import { useEpisodesChangedSync } from "./lib/sse";

export function App() {
  useEpisodesChangedSync();
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<EpisodeList />} />
          <Route path="/episodes/:name" element={<EpisodeEdit />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}
