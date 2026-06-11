# PLAN: Pipeline tự động tạo video động từ audio (Remotion)

> Spec này dùng để giao cho **Claude Code** thực hiện. Mỗi Phase có mục tiêu rõ và tiêu chí nghiệm thu (Acceptance). Làm tuần tự, xong phase nào kiểm tra phase đó rồi mới sang phase tiếp theo. Không nhảy cóc.

---

## 0. Bối cảnh & Mục tiêu

**Người dùng:** Một creator cá nhân làm kênh video triết học / tâm lý trên Facebook. Mỗi ngày đã có sẵn **một file audio** (lời đọc/podcast, định dạng mp3 hoặc wav). Hiện đang dùng ảnh tĩnh, muốn chuyển sang **video động tự sinh từ audio**.

**Mục tiêu cuối:** Một dự án Remotion sao cho quy trình hằng ngày chỉ còn:

```bash
# bỏ 1 file audio vào, chạy 1 lệnh, ra 1 file mp4
npm run make -- ./input/episode-2026-06-11.mp3
```

Lệnh đó phải tự động:
1. Đọc audio, tính độ dài video = độ dài audio.
2. Transcribe audio (Whisper) ra transcript có timestamp → dùng cho caption + để đổi cảnh theo nội dung.
3. Render video gồm: **visualizer sóng âm phản ứng theo giọng nói** + **animation minh hoạ nhẹ** + **caption chạy theo lời nói**.
4. Xuất ra `output/<tên-file>.mp4` đã ghép sẵn audio.

**Phong cách hình ảnh:** tĩnh lặng, trầm, hợp chủ đề triết/tâm lý. Palette tối giản (nền tối, 1–2 màu nhấn). Không loè loẹt, không chuyển động giật. Ưu tiên cảm giác "thiền", chậm rãi.

**Ràng buộc kỹ thuật:**
- Dùng cho cá nhân → Remotion bản miễn phí là đủ, không cần license thương mại.
- Người dùng code React/JS tốt → code có thể dùng TypeScript, không cần giải thích cơ bản.
- Phải chạy được **offline/local** (không phụ thuộc dịch vụ trả phí). Whisper chạy local qua whisper.cpp.

---

## 1. Stack công nghệ (đã chốt — không cần đề xuất lại)

| Thành phần | Dùng cái gì | Vai trò |
|---|---|---|
| Khung video | **Remotion** (TypeScript) | Dựng video bằng React, render ra mp4 |
| Audio-reactive | `@remotion/media-utils` (`visualizeAudio`, `useAudioData`, `getAudioDurationInSeconds`) | Lấy biên độ tần số theo frame để vẽ sóng âm |
| Transcribe | `@remotion/install-whisper-cpp` (whisper.cpp, chạy local) | Audio → transcript JSON có timestamp |
| Caption | `@remotion/captions` | Chuẩn hoá transcript → caption hiển thị theo frame |
| Duration metadata | `@remotion/media-parser` (`parseMedia`) | Lấy độ dài audio trong `calculateMetadata` (Node-side) |
| Render/CLI | `@remotion/cli` + `@remotion/renderer` | Lệnh `make` tự động hoá toàn bộ |
| Ghép audio | Remotion tự gọi ffmpeg nội bộ | (không cần cài ffmpeg riêng) |

Cài Whisper model **medium** mặc định cho tiếng Việt (model `base`/`small` đa số nuốt dấu, sai chính tả nặng — không dùng được cho caption). Cho phép override qua env `WHISPER_MODEL`. Ngôn ngữ mặc định `vi`.

---

## 2. Cấu trúc thư mục mục tiêu

> Repo hiện tại là `podcast-builder/` — toàn bộ pipeline cài thẳng vào đây, không tạo subdir `video-pipeline/`.

```
podcast-builder/
├── package.json
├── remotion.config.ts          # set concurrency, codec, image format
├── tsconfig.json
├── input/                      # nơi bỏ file audio hằng ngày (gitignore)
├── output/                     # video xuất ra (gitignore)
├── tmp/                        # transcript JSON tạm + props file (gitignore)
├── public/                     # audio được copy vào đây trước khi render (gitignore nội dung trừ .gitkeep)
├── whisper.cpp/                # binary + model whisper (gitignore)
├── scripts/
│   ├── setup-whisper.ts        # tải & cài whisper.cpp + model (chạy 1 lần)
│   ├── transcribe.ts           # audio -> tmp/<name>.json (transcript có timestamp)
│   └── make.ts                 # orchestrator: transcribe -> render -> output mp4
└── src/
    ├── Root.tsx                # đăng ký composition + calculateMetadata (duration động)
    ├── theme.ts                # palette, font, hằng số phong cách (1 chỗ duy nhất)
    ├── Video.tsx               # composition chính, ghép các layer lại
    └── components/
        ├── Background.tsx      # nền gradient/noise chuyển động chậm
        ├── Visualizer.tsx      # sóng âm phản ứng theo audio
        ├── Captions.tsx        # caption chạy theo transcript
        └── SceneArt.tsx        # animation minh hoạ nhẹ, đổi theo mốc thời gian
```

---

## 3. Brand palette — KHOÁ CỐ ĐỊNH (bất biến giữa các video)

Màu là chữ ký nhận diện kênh. Người xem lướt Facebook chỉ cần thấy màu là biết là kênh nào. Nguyên tắc: **khoá một bộ màu cố định, mọi video dùng chung; chỉ cho phép màu nhấn phụ xê dịch nhẹ trong dải đã định trước theo mood**.

### 3.1 Bộ màu chính ("trầm ấm, sách cũ / ánh nến") — bất biến

| Vai trò | Hex | Ghi chú |
|---|---|---|
| Nền chính | `#0E0F13` | gần đen ngả xanh — sâu, tĩnh. **KHÔNG dùng `#000`**. |
| Lớp nền phụ | `#1A1C22` | tách lớp nhẹ (panel, card, vignette) |
| Chữ chính | `#ECE8E1` | trắng ngà ấm, chất giấy. **KHÔNG dùng `#FFF`** — gắt mắt. |
| Chữ phụ/mờ | `#8A8A94` | metadata, timestamp, label phụ |
| **Signature** (chữ ký kênh) | `#C9A96A` | vàng đồng dịu — gợi chiêm nghiệm/uyên bác. Xuất hiện ở **MỌI** video: dải chính của visualizer, highlight caption, điểm nhấn SceneArt. |
| Accent lạnh mặc định | `#5E7C8B` | xanh xám bụi — đối trọng lý trí |

**3 thứ luôn bất biến giữa mọi video: nền `#0E0F13` + chữ ngà `#ECE8E1` + signature `#C9A96A`.** Không phase nào, không cảnh nào được phép đổi 3 thứ này.

### 3.2 Mood accent — dải được phép xê dịch theo nội dung

Mỗi scene trong SceneArt (Phase 5) chọn 1 mood accent thay cho `accentCool` mặc định, dựa trên nội dung đoạn đó. Tất cả đều **giảm bão hoà (saturation ~25–35%)** để không phá tông tổng thể.

| Mood key | Hex | Khi dùng |
|---|---|---|
| `social` (mặc định) | `#5E7C8B` | xanh xám — xã hội, kết nối, lý trí |
| `emotional` | `#A56B5C` | hồng đất desaturated — cảm xúc, mất mát |
| `existential` | `#6E5E7C` | tím khói — hiện sinh, vô thường |
| `contemplative` | `#7C8B5E` | xanh ô liu — chiêm nghiệm, tự nhiên |

**Cấm:** màu rực, neon, saturation cao, trắng tinh, gradient cầu vồng. Bất kỳ màu nào không nằm trong Mục 3.1/3.2 đều là vi phạm.

### 3.3 Quy tắc dùng trong code (cho Claude Code)

- Mọi component đọc màu từ `theme.COLORS` / `theme.MOOD_ACCENTS` — **cấm hardcode hex trong JSX/SVG/CSS**. Nếu cần biến thể (vd alpha 0.5), dùng helper `withAlpha(COLORS.signature, 0.5)` chứ không viết `#C9A96A80` thẳng.
- `splitScenes()` ở Phase 5 trả về `Scene[]` với shape `{startMs, endMs, mood: MoodKey}`. Map keyword → mood ở hàm pure `pickMood(text) → MoodKey`:
  - emotional: "yêu", "mất", "buồn", "đau", "nhớ", "cô đơn"
  - existential: "ý nghĩa", "vô nghĩa", "chết", "tồn tại", "hư vô", "thời gian"
  - contemplative: "tự nhiên", "im lặng", "tĩnh", "thiền", "đơn giản"
  - mặc định: social
- Visualizer (Phase 2): dải chính dùng `COLORS.signature`; glow/reflection mờ dùng mood accent của cảnh đang chạy (cross-fade khi đổi cảnh).
- Caption (Phase 4): chữ chính `COLORS.textPrimary`; từ được nhấn (nếu dùng word-level highlight kiểu TikTok) dùng `COLORS.signature`.

### 3.4 Đổi cả hệ sau này

Muốn chuyển sang tông lạnh hiện đại hơn (lấy `#5E7C8B` làm signature, `#C9A96A` xuống phụ) → chỉ sửa `theme.ts` ở 1 chỗ, toàn bộ video tự đổi. Đây là lý do **cấm hardcode hex**.

### 3.5 Typography — KHOÁ tương tự bảng màu

Font quan trọng ngang màu. Tiếng Việt khó hơn: nhiều font đẹp nhưng **vỡ dấu** (thiếu glyph dấu nặng/ngã, hoặc dấu đặt sai chỗ trên nguyên âm có mũ). Chốt 2 font đã verify đầy đủ dấu tiếng Việt:

| Vai trò | Font | Lý do |
|---|---|---|
| Display (hook / tiêu đề / trích dẫn) | **Lora** (serif) | Chữ chân nhẹ, hợp tông sách cũ / triết. Glyph dấu chuẩn. |
| Body (caption / metadata / CTA / watermark) | **Be Vietnam Pro** (sans) | Thiết kế riêng cho tiếng Việt, dấu đặt hoàn hảo. Đọc trên mobile rõ. |

Load qua `@remotion/google-fonts/Lora` và `@remotion/google-fonts/BeVietnamPro` (Remotion preload + cache, không phải tự fetch). Trong `theme.ts`:

```ts
export const FONTS = {
  display: '"Lora", Georgia, serif',
  body: '"Be Vietnam Pro", system-ui, sans-serif',
};
```

**Scale chuẩn cho FORMAT 9:16 (1080×1920):**

| Vai trò | px | Font |
|---|---|---|
| Hook (3s vàng) | 88 | display |
| Tiêu đề tập (intro card) | 64 | display |
| Caption (lời nói) | 56 | body, weight 500 |
| Metadata / số tập / CTA | 36 | body |
| Watermark | 28 | body, opacity 0.45 |

`line-height: 1.3`, display có `letter-spacing: -0.01em`. Cho FORMAT 16:9 (1920×1080), chia tất cả cho ~1.4.

### 3.6 Safe-zone — tránh chữ bị Facebook che

Facebook đè UID + nút share/like/comment lên video. Định nghĩa safe-zone trong `theme.ts`:

```ts
export const SAFE_ZONE = {
  top: 120,      // né nút "..." và header
  bottom: 280,   // né caption FB tự thêm + nút reaction
  left: 60,
  right: 60,
};
```

- **Caption phải nằm trong safe-zone** — không ép sát mép. Cụ thể: caption box căn giữa, max-width = `WIDTH - 2*SAFE_ZONE.left`.
- **Watermark** đặt ở `top: SAFE_ZONE.top + 20` góc phải (né nút "..." mà vẫn trong frame).
- **CTA outro** nằm trên `bottom - SAFE_ZONE.bottom`.
- Visualizer/SceneArt được phép tràn ra ngoài safe-zone (chỉ là nền), nhưng phần nhấn quan trọng (logo, signature element) giữ trong safe-zone.

---

## 4. Episode config — input hằng ngày (thay vì sửa code)

Mỗi tập có 1 file JSON tên trùng audio: `input/episode-2026-06-12.json`. Đây là **toàn bộ thứ người dùng sửa hằng ngày** ngoài bản thân file audio. Sửa JSON + chạy lệnh — không động vào code.

### 4.1 Schema

```json
{
  "title": "Vì sao chúng ta cô đơn giữa đám đông",
  "hook": "Bạn có bao giờ cảm thấy lạc lõng giữa hàng trăm người không?",
  "episodeNumber": 42,
  "moodOverride": null,
  "bgm": "./assets/bgm/contemplative-1.mp3",
  "bgmVolumeDb": -28,
  "showIntro": true,
  "showOutro": true,
  "sceneOverrides": null
}
```

| Field | Bắt buộc | Ý nghĩa |
|---|---|---|
| `title` | ✓ | Hiện ở intro card, dùng làm thumbnail |
| `hook` | ✓ | Câu hook hiện 3s đầu (sau intro 2.5s). null → bỏ qua hook, vào thẳng caption |
| `episodeNumber` | ✓ | Số tập, hiện nhỏ ở intro + watermark |
| `moodOverride` | — | `"emotional" \| "existential" \| ...` ép cả video về 1 mood thay vì auto từ transcript |
| `bgm` | — | Đường dẫn nhạc nền. null = không nhạc nền |
| `bgmVolumeDb` | — | Mặc định -28 dB (so với giọng đã normalize) |
| `showIntro`/`showOutro` | — | Tắt nếu cần video ngắn |
| `sceneOverrides` | — | `Array<{startMs, mood}>` ép thứ tự mood thủ công cho cảnh — dùng khi heuristic sai |

### 4.2 Vòng đời

- File này **COMMIT vào git** (lịch sử nội dung tập). Audio (`input/<name>.mp3`) thì gitignore.
- Nếu file không tồn tại khi chạy `make` → tự tạo template từ tên file + warn, dừng lại để user điền `title` + `hook`.
- Phase 7 (Orchestrator) đọc file này trước, validate schema (zod), truyền xuống làm prop của composition.

### 4.3 Tái lập (reproducibility)

Đủ để render lại y hệt tập cũ sau 6 tháng:
- `input/episode-*.json` (commit)
- `tmp/<name>.json` transcript (commit — nhỏ, có giá trị lịch sử)
- `output/<name>.lock.json` ghi version Remotion + hash `theme.ts` + model whisper (xem Phase 7)

---

## 5. Các Phase thực hiện

### Phase 0 — Khởi tạo dự án
- [ ] Tạo dự án Remotion mới (TypeScript) tại root repo, cài các package ở mục 1.
- [ ] Tạo cây thư mục như mục 2, cập nhật `.gitignore` để bỏ qua `input/ output/ tmp/ node_modules/ whisper.cpp/ public/*` (giữ `public/.gitkeep`).
- [ ] `src/theme.ts`: định nghĩa tập trung — **đọc Mục 3 (Brand palette) để biết bảng màu/font/safe-zone BẮT BUỘC, không tự đổi**. Cấu trúc tối thiểu:
  - `COLORS`: 6 hằng số ở Mục 3.1.
  - `MOOD_ACCENTS: Record<MoodKey, string>`: 4 mood ở Mục 3.2.
  - `FONTS`: `display` (Lora) + `body` (Be Vietnam Pro) — xem Mục 3.5. Load qua `@remotion/google-fonts/Lora` và `@remotion/google-fonts/BeVietnamPro`, gọi `loadFont()` ở top-level của `theme.ts`.
  - `TYPE_SCALE`: object chứa size từng vai trò (hook 88, title 64, caption 56, meta 36, watermark 28).
  - `SAFE_ZONE`: 4 hằng số ở Mục 3.6.
  - `BRAND`: `channelName`, `logoSrc` (`staticFile('brand/logo.svg')`), `cta` (vd "Theo dõi để xem thêm").
  - `FPS = 30`, `WIDTH/HEIGHT`, `FORMAT`. **FORMAT (dọc 9:16 vs ngang 16:9) là biến config dễ đổi** — mặc định 9:16 (1080×1920) cho Reels.
- [ ] `remotion.config.ts`: 
  - `Config.setConcurrency(Math.max(1, os.cpus().length - 2))`
  - `Config.setVideoImageFormat('jpeg')`, `Config.setCodec('h264')`
  - **Spec Facebook:** codec `h264`, audio codec `aac`, audio bitrate `192k`, video bitrate scaled theo độ phân giải (~8 Mbps cho 1080p dọc). Set qua `Config.setAudioCodec('aac')`, dùng `--video-bitrate` khi render full.
- [ ] Tạo `public/brand/logo.svg` (placeholder đơn sắc dùng `COLORS.signature` — user sẽ thay sau).

**Acceptance:** `npx remotion studio` mở được, hiện composition trống nền đúng `COLORS.bg` từ theme + 1 dòng text title đọc `FORMAT` và `FPS` từ theme (để verify theme load đúng, không phải hardcode).

---

### Phase 1 — Audio vào & duration động (nền tảng quan trọng nhất)
- [ ] `src/Root.tsx`: composition nhận props:
  ```ts
  type CompProps = {
    audioSrc: string;            // relative public/
    transcriptSrc?: string;      // relative public/
    bgmSrc?: string;             // relative public/, optional
    episode: EpisodeConfig;      // schema ở Mục 4.1
  };
  ```
  Cả các path đều là **relative tới `public/`** (Remotion convention — dùng `staticFile()` trong component). Schema `EpisodeConfig` định nghĩa cùng `theme.ts` hoặc file riêng `src/episode.ts` (zod schema).
- [ ] Trong `calculateMetadata({props})` (async, Node-side), dùng `parseMedia` từ `@remotion/media-parser`:
  ```ts
  import { parseMedia } from '@remotion/media-parser';
  const { slowDurationInSeconds } = await parseMedia({
    src: path.join(process.cwd(), 'public', props.audioSrc),
    fields: { slowDurationInSeconds: true },
  });
  return { durationInFrames: Math.ceil(slowDurationInSeconds * FPS) };
  ```
  KHÔNG dùng `getAudioDurationInSeconds` ở đây — đó là helper client-side.
- [ ] `src/Video.tsx`: render `<Audio src={staticFile(audioSrc)} />` + nền từ `Background.tsx`.
- [ ] Convention: pipeline sẽ copy file audio từ `input/` sang `public/` trước khi render (Phase 6 lo); studio dev có thể trỏ trực tiếp tới audio đã copy thủ công vào `public/`.

**Acceptance:** Copy 1 audio vào `public/test.mp3`, mở studio với props `{audioSrc: "test.mp3"}` thấy timeline có độ dài đúng bằng audio, nghe được tiếng.

---

### Phase 2 — Visualizer sóng âm (audio-reactive)
- [ ] `src/components/Visualizer.tsx`: dùng `useAudioData(audioSrc)` + `visualizeAudio()` lấy mảng biên độ theo frame, vẽ ra các thanh/sóng.
- [ ] Phong cách: **mượt, chậm, dịu** — làm mượt giá trị (ví dụ trung bình trượt vài frame) để không nhấp nháy gắt; dùng `numberOfSamples` ~32–64; đối xứng qua trục để trông cân.
- [ ] Bố cục tuỳ FORMAT: 9:16 thì visualizer nằm giữa hoặc 1/3 dưới.

Code sketch cho phần lõi (Claude Code triển khai đầy đủ, đây chỉ là định hướng):

```tsx
import { visualizeAudio, useAudioData } from "@remotion/media-utils";
import { useCurrentFrame, useVideoConfig } from "remotion";

const audioData = useAudioData(audioSrc);
const frame = useCurrentFrame();
const { fps } = useVideoConfig();
if (!audioData) return null;

const bands = visualizeAudio({
  audioData, frame, fps,
  numberOfSamples: 64,
}); // -> mảng [0..1], map ra chiều cao/độ mờ từng thanh
```

**Acceptance:** Visualizer nhảy theo to/nhỏ của giọng nói, mượt, không giật. Khi audio im lặng thì sóng lặng.

---

### Phase 3 — Transcribe tự động (Whisper local)
- [ ] `scripts/setup-whisper.ts`: dùng API của `@remotion/install-whisper-cpp`:
  - `installWhisperCpp({to: './whisper.cpp', version: '...'})`
  - `downloadWhisperModel({folder: './whisper.cpp', model: process.env.WHISPER_MODEL ?? 'medium'})`
  Idempotent — chạy lại không hỏng.
- [ ] `scripts/transcribe.ts`: nhận đường dẫn audio →
  1. **Cache check:** nếu `tmp/<name>.json` đã tồn tại và `mtime` mới hơn audio thì in `[cache] skip` và return — không chạy whisper lại.
  2. Convert sang WAV 16kHz mono nếu cần (whisper.cpp yêu cầu), ghi `tmp/<name>.wav`.
  3. Gọi `transcribe({...})` từ `@remotion/install-whisper-cpp` với `language: 'vi'`, `tokenLevelTimestamps: true`.
  4. Ghi nguyên `TranscriptionJson` ra `tmp/<name>.json` — **không đổi schema**, để Phase 4 dùng `toCaptions()` của `@remotion/captions` parse trực tiếp.

**Acceptance:** Chạy `tsx scripts/transcribe.ts ./input/x.mp3` lần 1 ra JSON đúng schema Remotion; chạy lại lần 2 thấy `[cache] skip`. Mở JSON kiểm tra timestamp khớp audio bằng tai (đoạn đầu, đoạn giữa, đoạn cuối).

---

### Phase 4 — Caption chạy theo lời nói
- [ ] `src/components/Captions.tsx`: load transcript bằng `delayRender()` + `fetch(staticFile(transcriptSrc))` + `continueRender()`. Tránh truyền cả transcript qua props (quá nặng).
- [ ] Dùng `toCaptions()` của `@remotion/captions` parse từ `TranscriptionJson` của whisper.cpp → mảng `Caption[]`. Sau đó dùng `createTikTokStyleCaptions()` (hoặc tự gom theo câu nếu muốn caption dài hơn 1-2 từ) để chia thành các "page" hiển thị.
- [ ] Style caption: chữ lớn vừa phải, dễ đọc trên mobile, fade in/out nhẹ theo `interpolate()`. Hợp tông triết/tâm lý (không viền dày kiểu meme). Đọc màu/font từ `theme.ts`.
- [ ] An toàn: nếu `transcriptSrc` undefined hoặc fetch lỗi → Captions return `null`, video vẫn render được.

**Acceptance:** Caption hiện đúng câu khớp thời điểm trong audio, đổi mượt, không đè lên visualizer. Xoá prop `transcriptSrc` thì video vẫn render OK (không caption).

---

### Phase 5 — Animation minh hoạ nhẹ (SceneArt)
- [ ] `src/components/SceneArt.tsx`: animation trừu tượng nhẹ làm "hồn" cho video — ví dụ: hình khối hình học trôi chậm, vòng tròn nở/co theo nhịp, hạt particle lững lờ, gradient dịch chuyển. Tất cả bằng SVG/Canvas + `interpolate()`/`spring()` theo `useCurrentFrame()`.
- [ ] **Đổi "cảnh" theo nội dung — quy tắc chia đoạn cụ thể (không tự chế):**
  - Duyệt segment của transcript, mở cảnh mới khi gặp **gap ≥ 1.5s** giữa 2 segment liên tiếp,
  - HOẶC khi cảnh hiện tại đã chứa **≥ 4 câu** (đếm theo dấu `.` `?` `!`),
  - HOẶC khi cảnh hiện tại đã dài **≥ 25s** (cap trên, tránh cảnh quá lâu cho podcast nói liên tục).
  - Mỗi cảnh có `mood: MoodKey` từ `pickMood(text)` (xem Mục 3.3). Màu accent của cảnh = `theme.MOOD_ACCENTS[mood]`. Cross-fade ~1s giữa các cảnh.
  - Bố cục/hình khối có thể đổi nhẹ theo cảnh (preset layout) NHƯNG nền + signature giữ nguyên — chỉ accent đổi.
- [ ] Logic chia đoạn để trong hàm pure `splitScenes(transcript) → Scene[]` (dễ test, dễ chỉnh ngưỡng).
- [ ] Giữ chuyển động **chậm và tối giản** — đây là kênh triết/tâm lý, không phải gaming.

**Acceptance:** Video có chiều sâu thị giác, cảnh đổi nhẹ nhàng theo tiến trình lời nói (verify bằng cách in ra số cảnh + mốc thời gian), tổng thể hài hoà với visualizer + caption.

---

### Phase 6 — Bookend: Intro / Hook / Watermark / Outro (nhận diện)

Layer "khung" cho mọi video — đây là phần xây thương hiệu kênh và quyết định 3 giây giữ chân Facebook.

- [ ] `src/components/IntroCard.tsx`: frame 0 → ~2.5s. Hiển thị:
  - Logo (`theme.BRAND.logoSrc`) căn giữa, fade in từ frame 10.
  - Tên kênh (`channelName`, display font 64px, signature color) bên dưới logo.
  - `episode.title` (display 48px, textPrimary) + `#<episodeNumber>` (body 36px, textMuted) — fade in muộn hơn ~15 frame.
  - Toàn bộ cross-fade sang nội dung chính trong ~12 frame cuối.
  - Ẩn nếu `episode.showIntro === false`.
- [ ] `src/components/Hook.tsx`: ngay sau Intro, kéo dài ~3.5s. Hiển thị `episode.hook`:
  - Display font, 88px (theo `TYPE_SCALE.hook`), textPrimary, căn giữa frame.
  - Nằm trong `SAFE_ZONE`. Max 2 dòng — nếu dài quá, giảm size xuống 72px (logic trong component).
  - Caption thường tạm ẩn ở khoảng này (Captions tự check frame range của Hook).
  - Bỏ qua nếu `episode.hook == null` → vào thẳng caption.
- [ ] `src/components/Watermark.tsx`: hiện xuyên suốt **sau Intro đến trước Outro**:
  - Góc trên-phải, `top: SAFE_ZONE.top + 20`, `right: SAFE_ZONE.right`.
  - `theme.BRAND.channelName` (28px body, opacity 0.45) + logo nhỏ bên cạnh.
  - Vị trí cố định, không animate (đỡ phân tâm).
- [ ] `src/components/OutroCard.tsx`: ~4s cuối video.
  - Fade out nội dung chính + BGM giảm dần.
  - Logo lớn + `theme.BRAND.cta` ("Theo dõi để xem thêm") display 56px + `channelName` body 36px.
  - Cross-fade vào, giữ tĩnh, không CTA động (tông trầm).
  - Ẩn nếu `episode.showOutro === false`.
- [ ] **Sequencing:** `Video.tsx` dùng `<Sequence>` để layer các phần theo frame range. Hook + Intro KHÔNG đụng audio — audio đã chạy từ frame 0.

**Acceptance:** Render 1 episode đầy đủ thấy: 2.5s intro với title → 3.5s hook to giữa khung → nội dung chính (visualizer + caption + SceneArt + watermark góc) → 4s outro CTA. Sửa `title`/`hook` trong `episode.json`, render lại thấy đổi đúng. `showIntro: false` thì bỏ intro nhưng audio + duration vẫn đúng.

---

### Phase 7 — Xử lý âm thanh (loudness normalization + BGM ducking)

- [ ] `scripts/process-audio.ts`: tiền xử lý audio TRƯỚC khi vào pipeline render.
  1. **Loudness normalization** sang `-16 LUFS` (Facebook khuyến nghị ~-14 LUFS nhưng -16 an toàn không bị FB nén thêm). Dùng ffmpeg `loudnorm` filter **2-pass** (pass 1 đo, pass 2 áp dụng — chất lượng tốt hơn 1-pass).
  2. Convert sang WAV 16kHz mono (whisper cần) cho transcribe, đồng thời ghi bản 48kHz stereo cho render.
  3. Output: `tmp/<name>.normalized.wav` (cho transcribe) + `tmp/<name>.normalized.48k.wav` (cho render).
  4. Cache theo mtime giống Phase 3.
- [ ] BGM ducking — thực hiện trong Remotion (không pre-mix trong ffmpeg để dễ tune):
  - `src/components/BGMTrack.tsx`: render `<Audio src={staticFile(bgmSrc)} volume={f => ...} loop />`.
  - Volume function: tại mỗi frame, kiểm tra xem có caption đang active không (check qua transcript đã load):
    - Có lời → `volume = baseVolume * 0.35` (~9dB ducking).
    - Im lặng → `volume = baseVolume`.
  - Smooth bằng `interpolate()` với cửa sổ ~150ms (~4-5 frame ở 30fps) để tránh giật. Tham khảo `Audio` example trong Remotion docs về `volume` callback.
  - `baseVolume = dbToGain(episode.bgmVolumeDb ?? -28)`.
- [ ] Nếu `episode.bgm == null` → `BGMTrack` không render. Pipeline vẫn chạy bình thường.
- [ ] Trong outro (4s cuối), `BGMTrack` fade out toàn bộ về 0.

**Acceptance:** Đo audio đầu ra bằng `ffmpeg -i output/x.mp4 -af ebur128 -f null -` thấy integrated loudness ~-16 LUFS. Bật BGM thấy nhạc lùi xuống khi có lời, lên lại khi im lặng, không giật. Nhiều tập render ra to bằng nhau.

---

### Phase 8 — Orchestrator `make` (tự động hoá đầu-cuối)
- [ ] `scripts/make.ts`: nhận 1 đối số đường dẫn audio + flags optional (`--preview`, `--no-thumb`), tự động:
  1. **Load episode config:** đọc `input/<name>.json`, validate bằng zod. Nếu không tồn tại → tạo template từ tên file + dừng, in hướng dẫn điền `title`/`hook`.
  2. **Process audio** (Phase 6): chuẩn hoá loudness → `tmp/<name>.normalized.48k.wav` + `tmp/<name>.normalized.wav`.
  3. **Copy** audio normalize + BGM (nếu có) vào `public/<name>.wav` + `public/bgm-<name>.<ext>`.
  4. **Transcribe** (Phase 3, cache-aware) trên bản 16kHz → `public/<name>.json`.
  5. **Ghi props file** `tmp/props-<name>.json` với `{audioSrc, transcriptSrc, bgmSrc, episode}` — KHÔNG inline qua `--props='{...}'` (escape shell khổ).
  6. **Preview hay full?**
     - `--preview`: render 480×854 (low-res 9:16), 10s đầu, codec nhanh (CRF cao). Output `output/<name>.preview.mp4`. Dùng để soi lỗi trước khi tốn 5-10 phút render full.
     - Mặc định: render full theo spec Facebook ở Mục 9 (1080×1920, H.264 + AAC 192k, video bitrate ~8Mbps).
  7. Gọi `renderMedia()` của `@remotion/renderer`.
  8. **Thumbnail** (skip nếu `--no-thumb` hoặc preview mode): `renderStill()` ở frame của Hook (~frame 90) → `output/<name>.thumb.jpg`. Đây là cover up Facebook.
  9. **Lock file:** ghi `output/<name>.lock.json`:
     ```json
     {
       "renderedAt": "2026-06-12T...",
       "remotionVersion": "...",
       "themeHash": "sha256:...",
       "episodeHash": "sha256:...",
       "whisperModel": "medium",
       "audioHash": "sha256:..."
     }
     ```
     Đủ để biết tập này render từ version nào → tái lập sau này.
  10. Cleanup `public/` (xoá file đã copy vào, giữ logo + brand assets cố định). Giữ `tmp/` để debug.
- [ ] `package.json` scripts:
  - `"setup": "tsx scripts/setup-whisper.ts"`
  - `"make": "tsx scripts/make.ts"`
  - `"preview": "tsx scripts/make.ts --preview"`
  - `"studio": "remotion studio"`
- [ ] Xử lý lỗi rõ ràng, exit code ≠ 0 + message tiếng Việt: thiếu episode config, file không tồn tại, audio rỗng/lỗi, whisper chưa setup, loudnorm fail, render fail. Mỗi lỗi gợi ý cách sửa.

**Acceptance:** 
- `npm run preview -- ./input/test.mp3` ra file ~10s low-res nhanh (<30s render).
- `npm run make -- ./input/test.mp3` ra `output/test.mp4` full + `output/test.thumb.jpg` + `output/test.lock.json`. Mở video đủ 6 lớp (intro → hook → visualizer + caption + SceneArt + watermark → outro) khớp audio, to đều, BGM ducking đúng.
- Chạy lần 2 cùng audio thấy transcribe `[cache] skip`.
- Sửa `episode.json` (đổi `title`), chạy lại thấy intro/thumbnail đổi.

---

### Phase 9 — Hoàn thiện & tài liệu
- [ ] `README.md`: hướng dẫn:
  - Setup 1 lần (install, setup whisper, tạo logo brand)
  - Quy trình hằng ngày 3 bước (audio + episode.json + make)
  - Schema episode.json (link sang Mục 4.1)
  - Đổi FORMAT dọc/ngang, đổi brand (màu/font/logo) trong `theme.ts`
  - Đổi Whisper model qua env
  - Cách sửa transcript thủ công nếu whisper sai (sửa `tmp/<name>.json` trước khi render, nhưng make sẽ ghi đè — workaround: copy ra `tmp/<name>.manual.json` + chạy với env `TRANSCRIPT_OVERRIDE=...`)
- [ ] Kiểm tra render full 1 episode thật từ đầu đến cuối, up thử lên Facebook (private post) để verify safe-zone không bị che.
- [ ] (Tuỳ chọn) `scripts/watch.ts`: theo dõi `input/`, có audio mới + có episode.json kèm thì tự `make`.

**Acceptance:** Một người mới đọc README có thể tự tạo video mà không cần hỏi thêm. Lock file đủ để render lại y hệt sau này.

---

## 6. Quy trình hằng ngày sau khi xong (mục tiêu trải nghiệm)

```bash
# Chỉ làm 1 lần khi cài máy:
npm install
npm run setup            # tải whisper + model

# Mỗi ngày (3 bước):
# 1. Bỏ audio vào input/
cp ~/Downloads/recording.mp3 ./input/episode-2026-06-12.mp3

# 2. Sửa episode config (mở editor, điền title + hook)
$EDITOR ./input/episode-2026-06-12.json

# 3. Preview nhanh, rồi render full
npm run preview -- ./input/episode-2026-06-12.mp3   # ~30s, soi bố cục
npm run make -- ./input/episode-2026-06-12.mp3      # render full
# -> output/episode-2026-06-12.mp4 + .thumb.jpg  (xong, up Facebook)
```

**Lưu ý:** lần đầu chạy `make` cho tập mới mà chưa có `episode-*.json` → script tự tạo template, dừng lại, in hướng dẫn điền. Sửa xong chạy lại.

---

## 7. Nguyên tắc cho Claude Code khi code

- **Tách config khỏi logic:** mọi thứ về phong cách (màu, font, format, tốc độ animation) gom vào `theme.ts` để chỉnh nhanh, không phải sửa rải rác.
- **Mọi thành phần phải fail an toàn:** thiếu transcript / audio lỗi thì component tự ẩn, không làm sập cả render.
- **Không hardcode độ dài video** — luôn suy ra từ audio.
- **Ưu tiên mượt & tối giản** hơn là hiệu ứng phô trương (đúng tông nội dung triết/tâm lý).
- Mỗi Phase xong **tự test bằng đúng Acceptance** rồi mới sang phase sau; báo lại kết quả từng phase.

## 8. Checkpoint preview giữa pipeline

Sau **Phase 2** (visualizer), **Phase 5** (SceneArt), và **Phase 6** (Bookend) — bắt buộc mở `npm run studio` test thủ công với 1 audio thật **trước khi** sang phase tiếp. Sau Phase 8 (orchestrator có sẵn), dùng `npm run preview` thay cho studio để check toàn cục nhanh.

Đừng đợi Phase 9 mới render full mới phát hiện cảnh giật / caption sai vị trí / hook bị cắt — sửa lúc đó tốn gấp đôi.

## 9. Export spec — chuẩn cho Facebook

| Thuộc tính | Giá trị |
|---|---|
| Container | `mp4` |
| Video codec | `h264` (yuv420p) |
| Resolution (Reels/Stories) | 1080×1920 dọc |
| Resolution (landscape) | 1920×1080 |
| Frame rate | 30 fps |
| Video bitrate | ~8 Mbps cho 1080p (Remotion CRF mặc định 18 thường OK; ép qua `--video-bitrate=8000K` cho ổn định) |
| Audio codec | `aac` |
| Audio bitrate | 192 kbps |
| Audio sample rate | 48 kHz |
| Loudness | -16 LUFS (xem Phase 7) |
| Color profile | sRGB / BT.709 |

**Safe-zone (Mục 3.6):** caption + watermark + CTA đều nằm trong vùng an toàn — Facebook chèn UID đầu trên + nút reaction/share dưới, chữ sát mép sẽ bị che.

**Preview mode** (`--preview`): 480×854, CRF 28, 10s đầu — chỉ để soi lỗi bố cục/timing, KHÔNG để up Facebook.

**Thumbnail** (`renderStill()` ở frame Hook): xuất `.jpg` quality 85, cùng aspect ratio video. Dùng làm cover khi up FB.

---

## 10. Rủi ro biết trước
- Whisper với **tiếng Việt** ở model `medium` thường tốt nhưng vẫn có thể sai chính tả / timestamp lệch nhẹ → cho phép nâng cấp lên `large-v3` qua env, và cho phép sửa tay file `public/<name>.json` trước khi render nếu cần độ chính xác cao (chạy lại `make` sẽ ghi đè — workaround: copy bản sửa tay sang chỗ khác, hoặc tách `transcribe` thành step riêng).
- Render video dọc 1080×1920 dài vài phút có thể tốn thời gian/CPU → concurrency đã set ở Phase 0, có thể override bằng `--concurrency` khi gọi `make`.
- `useAudioData` fetch file audio qua HTTP từ Remotion bundler → file phải nằm trong `public/`, không phải absolute path tuỳ ý. Đã xử lý ở Phase 6 (copy vào `public/`).
- `parseMedia` không support được mọi container — nếu input là `.m4a`/`.ogg` lạ, fallback sang `getAudioDurationInSeconds` qua ffprobe trong `make.ts` rồi pass `durationInFrames` xuống làm prop.
