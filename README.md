# podcast-builder

Pipeline tự động tạo video động (1080×1920 hoặc 16:9) từ file audio podcast Việt — bằng Remotion + Whisper local. Đi kèm **Studio UI** (Vite + React + Hono + SQLite) để thao tác qua web local, hoặc dùng console pure.

Workflow đầy đủ: ý tưởng → bài luận → NotebookLM podcast → render video. LLM hỗ trợ 4 step pre-production (Brainstorm / Bài luận / NLM prompt / Đề xuất tài liệu) qua OpenAI hoặc Ollama local. Output essay đậm chất chiêm nghiệm theo ByteCast Topic Framework v2 (13 field per idea: observation + paradox + scores 5 chiều + knowledge map + contrarian + thumbnail hooks + future-AGI + historical + story bank + outline 12 mục).

Output: video MP4 (H.264 + AAC, -16 LUFS) đủ tiêu chuẩn up Facebook + thumbnail JPEG + lock file để tái lập.

Đọc thêm: [`PLAN.md`](./PLAN.md) — spec đầy đủ, brand palette, schema episode config, từng phase + acceptance.

---

## Setup (chỉ 1 lần khi cài máy)

Yêu cầu:
- Node.js ≥ 20
- ffmpeg (đã có sẵn trên macOS qua brew: `brew install ffmpeg`)
- macOS / Linux (chưa test Windows; whisper.cpp build sẵn binary cho darwin-arm64 + linux)

```bash
npm install
npm run setup        # tải whisper.cpp + model (mặc định 'medium' — đủ chuẩn cho tiếng Việt)
```

Đổi model:

```bash
WHISPER_MODEL=large-v3 npm run setup   # chính xác hơn, chậm hơn
WHISPER_MODEL=small    npm run setup   # nhanh hơn, dấu kém hơn (tránh dùng prod)
```

Mặc định lưu tại `whisper.cpp/`. Model lớn nặng vài trăm MB — chỉ tải 1 lần.

Optional cho LLM features (brainstorm/essay/refs):

```bash
# Tùy chọn 1: OpenAI (yêu cầu API key, ~5-10s/call)
echo "OPENAI_API_KEY=sk-..." > .env

# Tùy chọn 2: Ollama local (offline, ~30s-2 phút/call tùy model)
brew install ollama
ollama pull qwen3:8b    # hoặc llama3:8b — Studio tự detect chat models
ollama serve            # background

# Cả 2 đều OK — UI cho phép chọn provider mỗi lần gen
```

**Database**: Studio dùng SQLite local (`data.db`) cho brainstorm/essays/refs/error log. Tự tạo khi run lần đầu. Nếu bạn từ version cũ (JSON files):

```bash
npm run migrate   # JSON brainstorm/essays/refs/error-log → SQLite, xoá JSON gốc sau verify
```

`data.db` gitignored vì là local data + có thể lớn.

---

## Cách dùng (chọn 1)

### A. Studio UI — recommended cho daily

```bash
npm run studio              # mở UI tại http://localhost:3000 + server :3001
```

Workflow trong UI (sidebar nav):

1. **Tập** (`/`) — drag-drop audio, edit config form auto-save 500ms, render preview/full SSE progress + queue. Pin episode ngôi sao lên đầu.
2. **Quy trình** (`/workflow`) — overview tất cả "chain" (topic) với progress 6 step (Brainstorm → Bài luận → NLM prompt → Tài liệu → Audio → Render), categories chips, top score badge
3. **Brainstorm** (`/brainstorm`) — gen 5 ý tưởng theo ByteCast Topic Framework v2 (13 field/idea: observation/scores/knowledgeMap/contrarian/thumbnail hooks/future-AGI/historical/storyBank/outline 12 mục). History sidebar bên trái, search + category filter, sort theo avgScore desc.
4. **Bài luận** (`/essay`) — gen 1800-2500 từ qua SSE stream, edit + auto-save 1.2s. Cùng trang: NLM prompt gen template + Đề xuất 5-9 tài liệu (5 tier: Meta/Review/Classic/Paper/Blog) + Upload audio NotebookLM → tạo tập prefill title/hook.
5. **Tri thức** (`/knowledge`) — Knowledge Graph aggregate ~50 concept (Heidegger / Hedonic Adaptation / Dopamine / Consumerism / Recommendation Algorithms…) từ tất cả sessions, group 6 lĩnh vực, expand xem session referencing.
6. **Hình ảnh** (`/visual`) — Visual Library aggregate metaphors từ outline #12 (đồng hồ cát / hoa tàn / cánh cửa đóng…), copy clipboard cho AI gen ảnh.
7. **Tài liệu** (`/references`) — JSON library, scrape og:title + arXiv API + citation_pdf_url. Filter tag/type + search.
8. Mỗi tập có 5 tab: **Cấu hình** / **Cảnh** (inline edit + scene thumbnails qua renderStill) / **Transcript** (find/replace, edit per-câu) / **Tài liệu** (linked) / **File** (audio/video player + xoá).

**Phím tắt**: bấm `?` xem cheat sheet. `g e/w/b/s/r/k/v` navigate vim-style. `/` focus search.

### B. Console — automation hoặc batch

```bash
# 1. Bỏ file audio vào input/
cp ~/Downloads/recording.mp3 ./input/episode-2026-06-12.mp3

# 2. Sửa episode config (mở editor, điền title + hook)
$EDITOR ./input/episode-2026-06-12.json
```

Lần đầu chạy `make` mà chưa có file JSON → script tự tạo template + dừng + hướng dẫn điền.

---


## Quy trình console (bypass UI)

```json
{
  "title": "Khoảng trống và những điều bắt đầu",
  "hook": "Đôi khi chúng ta cần lạc đường, để tìm thấy chính mình.",
  "episodeNumber": 1,
  "moodOverride": null,
  "bgm": null,
  "bgmVolumeDb": -28,
  "showIntro": true,
  "showOutro": true,
  "sceneOverrides": null,
  "essayId": null
}
```

Schema chi tiết: [PLAN.md Mục 4.1](./PLAN.md#41-schema).

```bash
# 3. Preview nhanh trước khi render full
npm run preview -- ./input/episode-2026-06-12.mp3   # ~30s, 480×854 / 10s đầu — soi bố cục
npm run make -- ./input/episode-2026-06-12.mp3      # render full → output/
```

Output sau `make`:

- `output/episode-2026-06-12.mp4` — video full
- `output/episode-2026-06-12.thumb.jpg` — thumbnail cover (chụp ở câu Hook)
- `output/episode-2026-06-12.lock.json` — version Remotion + hash theme + hash episode + audio + whisper model (để render lại y hệt)

---

## Tùy biến

### Đổi brand (màu / font / logo) — 1 chỗ duy nhất

Mở [`src/theme.ts`](./src/theme.ts):

- `COLORS`: nền, chữ, signature, accent (xem [PLAN.md Mục 3.1](./PLAN.md#31-bộ-màu-chính-trầm-ấm-sách-cũ--ánh-nến--bất-biến))
- `MOOD_ACCENTS`: 4 mood (social/emotional/existential/contemplative)
- `FONTS`: display (Lora mặc định) + body (Be Vietnam Pro)
- `BRAND`: tên kênh + CTA outro
- Thay `public/brand/logo.svg` bằng logo riêng (giữ kích thước ~120×120 viewBox)

**Cấm hardcode hex trong component** — luôn đọc từ `theme.ts` (Mục 3.3 PLAN).

### Đổi FORMAT (dọc 9:16 → ngang 16:9)

`src/theme.ts`:

```ts
export const FORMAT = { width: 1920, height: 1080 } as const;
```

Có thể cần chỉnh `TYPE_SCALE` / `SAFE_ZONE` nhỏ hơn cho landscape.

### Đổi mood mặc định / mood override

Trong `episode.json`:

```json
{
  "moodOverride": "emotional",         // ép toàn bộ video về 1 mood
  "sceneOverrides": [                  // hoặc ép từng cảnh
    { "startMs": 5000,  "mood": "existential" },
    { "startMs": 12000, "mood": "contemplative" }
  ]
}
```

### Thêm nhạc nền (BGM)

```json
{
  "bgm": "./assets/bgm/contemplative-1.mp3",   // path relative tới audio
  "bgmVolumeDb": -28                            // âm lượng nền (mặc định -28 dB)
}
```

BGM tự duck -9dB khi có lời, fade out trong 2s cuối.

### Sửa transcript thủ công (khi Whisper sai)

Nếu Whisper transcribe sai chính tả / timestamp lệch:

```bash
# 1. Edit transcript trong tmp/
$EDITOR ./tmp/<name>.json

# 2. Render lại — nhưng phải xoá cache audio để skip re-transcribe
# WORKAROUND: copy bản sửa tay ra chỗ khác, sửa trực tiếp trong tmp/ sẽ bị ghi đè bởi cache check
# (TODO: thêm TRANSCRIPT_OVERRIDE env support — Phase 9.1)
```

Khuyến nghị: dùng model `medium` hoặc `large-v3` để giảm sai số ban đầu.

---

## Scripts

| Lệnh | Tác dụng |
|---|---|
| `npm run setup` | Cài whisper.cpp + model (1 lần) |
| `npm run studio` | **Mở Studio UI (Vite :3000 + Hono :3001) — daily workflow** |
| `npm run remotion-studio` | Mở Remotion Studio gốc (tune composition/component) |
| `npm run preview -- <audio>` | Render preview 480×854 / 10s qua console |
| `npm run make -- <audio>` | Render full + thumbnail + lock file qua console |
| `npm run spell-fix -- <audio>` | Sửa lỗi chính tả transcript Whisper qua OpenAI |
| `npm run typecheck` | Type check toàn project |

---

## Cấu trúc thư mục

Xem [PLAN.md Mục 2](./PLAN.md#2-cấu-trúc-thư-mục-mục-tiêu).

Quy tắc gitignore:
- **commit**: `input/episode-*.json` (lịch sử nội dung tập), `tmp/<name>.json` (transcript có thể sửa tay)
- **ignore**: `input/*.mp3`, `output/`, `public/*` (trừ `public/brand/`), `whisper.cpp/`, `tmp/*.wav`

---

## Tái lập (render lại tập cũ)

Đủ để render lại y hệt 1 tập sau 6 tháng:

1. `input/episode-*.mp3` (audio gốc)
2. `input/episode-*.json` (config — committed)
3. `tmp/*.json` (transcript — committed)
4. `output/*.lock.json` (ghi version & hash — committed)

Check lock file để biết theme/episode hash có thay đổi không trước khi render lại.

---

## Troubleshooting

**`whisper.cpp chưa cài. Chạy: npm run setup`** — chưa chạy setup, hoặc xoá nhầm `whisper.cpp/`.

**Audio rỗng / `parseMedia` fail** — file mp3/m4a hỏng. Kiểm tra: `ffprobe input/<file>`.

**Caption sai timestamp** — model whisper yếu. Nâng cấp:

```bash
WHISPER_MODEL=large-v3 npm run setup
rm tmp/<name>.json   # xoá cache transcript cũ
npm run make -- input/<file>.mp3
```

**Chữ bị Facebook che** — kiểm tra `SAFE_ZONE` trong `theme.ts`. Up thử FB private post để verify trước khi public.

**Render quá chậm** — giảm `Config.setConcurrency()` trong `remotion.config.ts` nếu máy lag; hoặc dùng `--preview` để soi lỗi trước khi render full.

---

## Trạng thái phase (theo PLAN.md)

- **Phase 0-9** — Pipeline Remotion + Whisper + orchestrator ✓
- **Phase 10** — Studio UI:
  - 10.0-10.6 MVP backend/frontend/SSE render/transcript review ✓
  - 10.7 Scene thumbnails qua renderStill ✓
  - 10.8 Polish (keyboard shortcuts + pin episodes + outline button) ✓
- **Phase 11** — Pre-production LLM:
  - 11.0-11.2 Reference Library ✓
  - 11.3 Brainstorm (OpenAI + Ollama) ✓
  - 11.4 Essay SSE streaming ✓
  - 11.5 NotebookLM prompt tuner ✓
  - 11.6 Đề xuất tài liệu (5 tier) ✓
  - 11.7 Workflow overview ✓
  - 11.8 Watch ~/Downloads/ (chưa)

**Extras (không có trong PLAN gốc):**
- ByteCast Topic Framework v1+v2: idea schema 13 field (observation/scores/knowledgeMap/contrarian/thumbnailHooks/futureConnection/historicalExamples/storyBank/outline)
- Phase C Topic Database: 16 category enum + dedup gen
- Phase D Knowledge Graph (`/knowledge`) + Visual Library (`/visual`)
- Server Monitor: `tmp` → DB error log + sticky banner + retry indicator
- SQLite migration (`data.db` via better-sqlite3) — replace JSON file stores
- Bridge Bài luận → Tập: upload audio NLM tự prefill title/hook
- Auto episodeNumber max+1 mỗi upload
- Files tab per episode (audio/video/thumb/lock inline + xoá)
- Form persist qua localStorage (Brainstorm draft + provider/model)
- Keyboard shortcuts (vim-style nav + `/` focus search)
- Pin episodes (star icon localStorage)
- Vietnamese labels chuẩn hoá

## Tham khảo

- [PLAN.md](./PLAN.md) — spec đầy đủ (brand, episode config, từng phase, export spec FB)
- [PLAN.md Mục 14](./PLAN.md#14-studio-ui--wrap-remotion-pipeline-cho-non-console-workflow) — roadmap Studio UI
- [Remotion docs](https://www.remotion.dev/docs)
- [@remotion/install-whisper-cpp](https://www.remotion.dev/docs/whisper-cpp)
- [@remotion/captions](https://www.remotion.dev/docs/captions)
