import { Hono } from "hono";
import { getEpisode, saveEpisode } from "../lib/episode-store";
import { blockMusicTrack, listMusicLibrary, pickMusicTrack, unblockMusicTrack } from "../lib/music-library";

/**
 * Kho nhạc nền xoay vòng (an toàn Content ID).
 *   GET  /api/music/library            → { tracks }
 *   POST /api/music/:id/block          body { reason? } → chặn bài (dính claim)
 *   POST /api/music/:id/unblock
 *   POST /api/music/reroll/:episode    → bốc bài khác cho tập (giữ âm lượng)
 */
export const musicRoutes = new Hono();

musicRoutes.get("/library", (c) => c.json({ tracks: listMusicLibrary() }));

musicRoutes.post("/:id/block", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  return c.json({ tracks: blockMusicTrack(c.req.param("id"), body.reason?.trim() ?? "") });
});

musicRoutes.post("/:id/unblock", (c) => c.json({ tracks: unblockMusicTrack(c.req.param("id")) }));

musicRoutes.post("/reroll/:episode", async (c) => {
  const name = c.req.param("episode");
  const summary = await getEpisode(name);
  if (!summary) return c.json({ error: `Không tìm thấy tập "${name}".` }, 404);
  const current = summary.config.bgm?.match(/^_music\/lib\/(.+)\.ogg$/)?.[1] ?? null;
  const track = pickMusicTrack(summary.config.series ?? "bytecast", name, current);
  if (!track) return c.json({ error: "Kho nhạc chưa có bài dùng được cho series này — chạy music-fetch." }, 400);
  await saveEpisode(name, { ...summary.config, bgm: track.bgm, musicCredit: track.credit });
  return c.json(await getEpisode(name));
});
