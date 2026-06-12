# PLAN: Pipeline tự động tạo video động từ audio (Remotion)

> Spec này dùng để giao cho **Claude Code** thực hiện. Mỗi Phase có mục tiêu rõ và tiêu chí nghiệm thu (Acceptance). Làm tuần tự, xong phase nào kiểm tra phase đó rồi mới sang phase tiếp theo. Không nhảy cóc.

---

## 0. Bối cảnh & Mục tiêu

**Người dùng:** Một creator cá nhân làm kênh video triết học / tâm lý trên Facebook. Mỗi ngày đã có sẵn **một file audio** (lời đọc/podcast, định dạng mp3 hoặc wav). Hiện đang dùng ảnh tĩnh, muốn chuyển sang **video động tự sinh từ audio**.

**Mục tiêu cuối:** Một dự án Remotion sao cho quy trình hằng ngày chỉ còn:

```bash
# bỏ 1 file audio vào, sửa 1 file JSON nhỏ, chạy 1 lệnh, ra 1 file mp4
npm run make -- ./input/episode-2026-06-11.mp3
```

Lệnh đó phải tự động:
1. Đọc audio, tính độ dài video = độ dài audio.
2. Chuẩn hoá loudness (Phase 7) → -16 LUFS, đo bằng `ebur128`.
3. Transcribe audio (Whisper) ra transcript có timestamp → dùng cho caption + để đổi cảnh theo nội dung.
4. Render video gồm các lớp (dưới → trên), TẤT CẢ do Remotion vẽ bằng code:
   - **Nền vàng thương hiệu** + **doodle trôi nhẹ** (squiggle/sparkle/đường chấm ở rìa).
   - **Lớp sticker/illustration theo cảnh** (đồ vật phẳng, bong bóng thoại, icon — vẽ bằng SVG, bố cục đổi theo mood/chủ đề).
   - **Visualizer sóng âm** (kiểu doodle navy + viền trắng, phản ứng audio).
   - **Caption trong thẻ sticker trắng bo tròn** (chạy theo transcript).
   - **Bookend**: Intro card → Hook 3.5s → (nội dung) → Outro CTA.
   - **Watermark** xuyên suốt.
5. Mix audio: giọng + BGM với ducking thông minh (nhạc lùi xuống khi có lời).
6. Xuất `output/<name>.mp4` (1080×1920, H.264, AAC 192k) + `output/<name>.thumb.jpg` (cover FB) + `output/<name>.lock.json` (reproducibility).

**Phong cách hình ảnh:** TƯƠI SÁNG, vui nhộn, năng lượng tích cực — kiểu **sticker/cắt dán + doodle vẽ tay**, chữ to đậm nghịch ngợm, nền vàng/kem rực rỡ, nhấn navy + đỏ + xanh dương + xanh ngọc, kèm icon/bong bóng thoại/mặt cười dễ thương. Đây là phong cách "edutainment" (giáo dục + giải trí), KHÔNG phải tông tối/trầm. Tham chiếu: bộ thumbnail của kênh (vàng rực, sticker viền trắng, chữ brush đậm). Chuyển động vẫn mượt, không giật.

**Ràng buộc kỹ thuật:**
- Dùng cho cá nhân → Remotion bản miễn phí là đủ, không cần license thương mại.
- Người dùng code React/JS tốt → code có thể dùng TypeScript, không cần giải thích cơ bản.
- Phải chạy được **offline/local**, **không gọi API trả phí, không tải asset ngoài**. Whisper chạy local qua whisper.cpp. Toàn bộ hình ảnh do Remotion tự vẽ bằng SVG. Chi phí ≈ 0, chỉ đánh đổi bằng thời gian render — đã chấp nhận.
- Ảnh AI / video stock / image-to-video bị **loại khỏi pipeline chính**; chỉ ghi ở Phụ lục (Mục 13) như nâng cấp tuỳ chọn về sau.

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
| Ghép audio | Remotion tự gọi ffmpeg nội bộ | (không cần cài ffmpeg riêng cho render) |
| Loudness norm | `ffmpeg` system (loudnorm 2-pass) | Chuẩn hoá -16 LUFS trước khi vào pipeline |

Cài Whisper model **medium** mặc định cho tiếng Việt (model `base`/`small` đa số nuốt dấu, sai chính tả nặng — không dùng được cho caption). Cho phép override qua env `WHISPER_MODEL`. Ngôn ngữ mặc định `vi`.

---

## 2. Cấu trúc thư mục mục tiêu

> Repo hiện tại là `podcast-builder/` — toàn bộ pipeline cài thẳng vào đây, không tạo subdir.

```
podcast-builder/
├── package.json
├── remotion.config.ts          # set concurrency, codec, image format
├── tsconfig.json
├── .env                        # (tuỳ chọn) override env vars — gitignore
├── input/                      # audio + episode-*.json hằng ngày
├── output/                     # video + thumbnail + lock file (gitignore)
├── tmp/                        # transcript + plan + audio normalized (gitignore)
├── public/                     # audio copy + transcript copy cho Remotion (gitignore content trừ brand/)
├── whisper.cpp/                # binary + model whisper (gitignore)
├── scripts/
│   ├── setup-whisper.ts        # tải & cài whisper.cpp + model
│   ├── process-audio.ts        # ffmpeg loudnorm 2-pass → tmp/*.normalized.wav
│   ├── transcribe.ts           # audio → tmp/<name>.json (transcript có timestamp)
│   ├── plan-episode.ts         # transcript → tmp/<name>.plan.json (cắt cảnh + gán mood + sceneType)
│   └── make.ts                 # orchestrator đầu-cuối
└── src/
    ├── Root.tsx                # đăng ký composition + calculateMetadata
    ├── theme.ts                # palette, font, safe-zone, hằng số phong cách (1 chỗ duy nhất)
    ├── episode.ts              # EpisodeConfig zod schema
    ├── scenes.ts               # splitScenes + pickMood + pickScene (pure)
    ├── Video.tsx               # composition chính, ghép các lớp
    └── components/
        ├── Background.tsx      # nền vàng + doodle trôi nhẹ ở rìa
        ├── stickers/           # THƯ VIỆN sticker vẽ bằng SVG (Mục 11.1)
        ├── doodles/            # THƯ VIỆN doodle vẽ bằng SVG (Mục 11.1)
        ├── SceneLayer.tsx      # router: chọn scene recipe theo Scene plan
        ├── scenes/             # 5–7 công thức cảnh (PodcastDesk, Idea, ...)
        ├── Visualizer.tsx      # sóng âm reactive kiểu doodle
        ├── Captions.tsx        # caption trong thẻ sticker trắng bo tròn
        ├── BGMTrack.tsx        # nhạc nền + ducking khi có lời
        ├── IntroCard.tsx       # 2.5s intro
        ├── Hook.tsx            # 3.5s câu hook
        ├── Watermark.tsx       # góc trên-phải xuyên suốt
        └── OutroCard.tsx       # 4s CTA cuối
```

---

## 3. Brand palette — KHOÁ CỐ ĐỊNH (bất biến giữa các video)

Màu là chữ ký nhận diện kênh. Người xem lướt Facebook chỉ cần thấy màu là biết là kênh nào. Nguyên tắc: **khoá một bộ màu cố định, mọi video dùng chung; chỉ cho phép màu nhấn phụ xê dịch nhẹ theo mood**.

### 3.1 Bộ màu chính (TƯƠI SÁNG — theo thumbnail kênh) — bất biến

| Token | Hex | Vai trò |
|---|---|---|
| `bg` | `#F9C81B` | **Nền chính — vàng rực** (nhận diện mạnh nhất của kênh) |
| `bgAlt` | `#F7EFD6` | Nền kem nhạt (đổi không khí cho vài cảnh suy ngẫm / Knowledge) |
| `ink` (signature) | `#16244F` | **Navy đậm** — màu chữ tiêu đề chính & nét chủ đạo, chữ ký kênh |
| `white` | `#FFFFFF` | Viền sticker, thẻ/bong bóng nền chữ (rất nhiều trong style này) |
| `accentRed` | `#E83E5A` | Đỏ/hồng — từ nhấn mạnh, trái tim, điểm nóng |
| `accentBlue` | `#3F6FD0` | Xanh dương — icon, bong bóng phụ |
| `accentTeal` | `#2EA48F` | Xanh ngọc — từ nhấn phụ, mặt cười, lá cây |

**3 thứ luôn bất biến giữa mọi video: nền `#F9C81B` vàng + ink navy `#16244F` + viền sticker `#FFFFFF`.** Đây là tổ hợp người xem nhận ra ngay khi lướt Facebook.

### 3.2 Mood accent — dải được phép xê dịch theo nội dung

| Mood key | Màu nhấn nổi bật | Hex | Khi dùng |
|---|---|---|---|
| `positive` (mặc định) | đỏ + vàng | `#E83E5A` | tích cực, hứng khởi, năng lượng |
| `social` | xanh dương | `#3F6FD0` | kết nối, xã hội, lý trí |
| `healing` | xanh ngọc | `#2EA48F` | nhẹ nhàng, chữa lành |
| `energetic` | đỏ hồng | `#E83E5A` | năng lượng, hứng khởi (alias `positive`) |
| `contemplative` | navy + kem (đổi `bg` → `bgAlt`) | `#16244F` | suy ngẫm, sâu — đoạn này nền chuyển sang `bgAlt` kem |

**Quy tắc dùng màu (Claude Code tuân thủ chặt):**
- `bg` vàng + `ink` navy + viền `white` GIỮ NGUYÊN ở mọi mood — chỉ màu nhấn nổi bật và đôi khi nền phụ `bgAlt` xê dịch.
- **Chữ chính = `ink` navy đậm trên nền sáng** (KHÔNG để chữ trắng trên nền sáng → khó đọc). Khi cần đặt chữ trên hình rối, **bọc chữ trong thẻ sticker trắng bo tròn** (xem Caption Phase 4).
- 3 màu nhấn (đỏ/xanh dương/xanh ngọc) dùng **tiết chế** cho từ khoá, icon, doodle — KHÔNG dùng tràn lan thành loè loẹt.
- **TRÁNH** nền tối/đen — phong cách kênh là sáng, vui.
- Chuyển màu giữa các mood **nội suy mượt** (`interpolateColors`) trong cross-fade.

### 3.3 Quy tắc dùng trong code (cho Claude Code)

- Mọi component đọc màu từ `theme.COLORS` / `theme.MOOD_ACCENTS` — **cấm hardcode hex trong JSX/SVG/CSS**. Nếu cần biến thể (vd alpha 0.5), dùng helper `withAlpha(COLORS.ink, 0.5)`.
- `splitScenes()` ở Phase 5 trả về `Scene[]` với shape `{startMs, endMs, mood: MoodKey, sceneType: SceneType}`. Map keyword → mood ở hàm pure `pickMood(text) → MoodKey`:
  - energetic / positive: "tự do", "yêu", "vui", "hứng khởi", "tuyệt vời"
  - social: "kết nối", "xã hội", "đám đông", "cộng đồng", "mạng"
  - healing: "im lặng", "chữa lành", "thiền", "tĩnh", "đơn giản", "hơi thở"
  - contemplative: "ý nghĩa", "vô nghĩa", "chết", "thời gian", "vô hạn"
  - mặc định: positive
- Visualizer (Phase 2): nét chính dùng `COLORS.ink` (navy) + viền `white` cho đúng style sticker; **không dùng vàng** vì trùng nền.
- Caption (Phase 4): **bọc chữ trong sticker trắng bo tròn** (`background: COLORS.white`, `border-radius: 24px`, padding, có thể có `outline: 4px solid COLORS.ink`); chữ `COLORS.ink`; từ được nhấn (word-level highlight) dùng `accentRed`.

### 3.4 Đổi cả hệ sau này

Muốn rebrand sang tông khác → chỉ sửa `theme.ts` ở 1 chỗ. Đây là lý do **cấm hardcode hex**. (Lịch sử: v1 dùng dark cinematic navy + brass gold; v2 chuyển sang bright yellow + navy theo thumbnail kênh thực tế; v3 chốt hướng pure-SVG sticker/doodle.)

### 3.5 Typography — KHOÁ tương tự bảng màu

Font quan trọng ngang màu. Tiếng Việt khó hơn: nhiều font đẹp nhưng **vỡ dấu**. Chốt 2 font:

| Vai trò | Font | Lý do |
|---|---|---|
| Display (hook / tiêu đề / sticker) | **Baloo 2** (rounded sans, weight 700-800) | Đậm, vui, bo tròn hợp sticker style. Hỗ trợ dấu tiếng Việt đầy đủ qua subset `vietnamese`. |
| Body (caption / metadata / watermark) | **Be Vietnam Pro** (sans, weight 600-700) | Thiết kế riêng cho tiếng Việt, dấu đặt hoàn hảo. Đọc trên mobile rõ. |

Load qua `@remotion/google-fonts/Baloo2` + `@remotion/google-fonts/BeVietnamPro`:

```ts
export const FONTS = {
  display: '"Baloo 2", system-ui, sans-serif',
  body: '"Be Vietnam Pro", system-ui, sans-serif',
};
```

**Scale chuẩn cho FORMAT 9:16 (1080×1920):**

| Vai trò | px | Font |
|---|---|---|
| Hook (3.5s vàng) | 88 | display |
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
- Visualizer/sticker được phép tràn ra ngoài safe-zone (chỉ là nền/trang trí), nhưng phần nhấn quan trọng (logo, signature element, chữ chính) giữ trong safe-zone.

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
| `hook` | ✓ | Câu hook hiện 3.5s đầu (sau intro 2.5s). null → bỏ qua hook, vào thẳng caption |
| `episodeNumber` | ✓ | Số tập, hiện nhỏ ở intro + watermark |
| `moodOverride` | — | `"positive" \| "social" \| "healing" \| "contemplative"` ép cả video về 1 mood thay vì auto từ transcript |
| `bgm` | — | Đường dẫn nhạc nền. null = không nhạc nền |
| `bgmVolumeDb` | — | Mặc định -28 dB (so với giọng đã normalize) |
| `showIntro`/`showOutro` | — | Tắt nếu cần video ngắn |
| `sceneOverrides` | — | `Array<{startMs, mood, sceneType}>` ép thủ công thứ tự cảnh — dùng khi heuristic sai |

### 4.2 Vòng đời

- File này **COMMIT vào git** (lịch sử nội dung tập). Audio (`input/<name>.mp3`) thì gitignore.
- Nếu file không tồn tại khi chạy `make` → tự tạo template từ tên file + warn, dừng lại để user điền `title` + `hook`.
- Phase 8 (Orchestrator) đọc file này trước, validate schema (zod), truyền xuống làm prop của composition.

### 4.3 Tái lập (reproducibility)

Đủ để render lại y hệt tập cũ sau 6 tháng:
- `input/episode-*.json` (commit)
- `tmp/<name>.json` transcript (commit — nhỏ, có giá trị lịch sử)
- `tmp/<name>.plan.json` episode plan (commit — chia cảnh + sceneType)
- `output/<name>.lock.json` ghi version Remotion + hash `theme.ts` + model whisper (xem Phase 8)

---

## 5. Các Phase thực hiện

### Phase 0 — Khởi tạo dự án
- [x] Tạo dự án Remotion (TypeScript) tại root repo, cài các package ở mục 1.
- [x] Tạo cây thư mục như mục 2, cập nhật `.gitignore` để bỏ qua `input/ output/ tmp/ node_modules/ whisper.cpp/ public/*` (giữ `public/.gitkeep`).
- [x] `src/theme.ts`: định nghĩa tập trung — **đọc Mục 3 (Brand palette) để biết bảng màu/font/safe-zone BẮT BUỘC, không tự đổi**. Cấu trúc tối thiểu:
  - `COLORS`: 6 hằng số ở Mục 3.1.
  - `MOOD_ACCENTS: Record<MoodKey, string>`: 5 mood ở Mục 3.2.
  - `FONTS`: `display` (Baloo 2) + `body` (Be Vietnam Pro) — xem Mục 3.5. Load qua `@remotion/google-fonts/Baloo2` và `@remotion/google-fonts/BeVietnamPro`, gọi `loadFont()` ở top-level của `theme.ts`.
  - `TYPE_SCALE`: object chứa size từng vai trò (hook 88, title 64, caption 56, meta 36, watermark 28).
  - `SAFE_ZONE`: 4 hằng số ở Mục 3.6.
  - `BRAND`: `channelName`, `logoSrc` (`staticFile('brand/logo.svg')`), `cta` (vd "Theo dõi để xem thêm").
  - `FPS = 30`, `WIDTH/HEIGHT`, `FORMAT`. **FORMAT (dọc 9:16 vs ngang 16:9) là biến config dễ đổi** — mặc định 9:16 (1080×1920) cho Reels.
- [x] `remotion.config.ts`:
  - `Config.setConcurrency(Math.max(1, os.cpus().length - 2))`
  - `Config.setVideoImageFormat('jpeg')`, `Config.setCodec('h264')`
  - **Spec Facebook:** codec `h264`, audio codec `aac`, audio bitrate `192k`, video bitrate scaled theo độ phân giải (~8 Mbps cho 1080p dọc). Set qua `Config.setAudioCodec('aac')`, dùng `--video-bitrate` khi render full.
- [x] Tạo `public/brand/logo.svg` (placeholder đơn sắc dùng `COLORS.ink` — user sẽ thay sau).

**Acceptance:** `npx remotion studio` mở được, hiện composition trống nền đúng `COLORS.bg` từ theme + 1 dòng text title đọc `FORMAT` và `FPS` từ theme (để verify theme load đúng, không phải hardcode).

---

### Phase 1 — Audio vào & duration động (nền tảng quan trọng nhất)
- [x] `src/Root.tsx`: composition nhận props:
  ```ts
  type CompProps = {
    audioSrc: string;            // relative public/
    transcriptSrc?: string;      // relative public/
    planSrc?: string;            // relative public/, optional
    bgmSrc?: string;             // relative public/, optional
    episode: EpisodeConfig;      // schema ở Mục 4.1
  };
  ```
  Cả các path đều là **relative tới `public/`** (Remotion convention — dùng `staticFile()` trong component). Schema `EpisodeConfig` định nghĩa trong file riêng `src/episode.ts` (zod schema).
- [x] Trong `calculateMetadata({props})` (async, Node-side), dùng `parseMedia` từ `@remotion/media-parser`:
  ```ts
  import { parseMedia } from '@remotion/media-parser';
  const { slowDurationInSeconds } = await parseMedia({
    src: path.join(process.cwd(), 'public', props.audioSrc),
    fields: { slowDurationInSeconds: true },
  });
  return { durationInFrames: Math.ceil(slowDurationInSeconds * FPS) };
  ```
  KHÔNG dùng `getAudioDurationInSeconds` ở đây — đó là helper client-side.
- [x] `src/Video.tsx`: render `<Audio src={staticFile(audioSrc)} />` + nền từ `Background.tsx`.
- [x] Convention: pipeline sẽ copy file audio từ `input/` sang `public/` trước khi render (Phase 8 lo); studio dev có thể trỏ trực tiếp tới audio đã copy thủ công vào `public/`.

**Acceptance:** Copy 1 audio vào `public/test.mp3`, mở studio với props `{audioSrc: "test.mp3"}` thấy timeline có độ dài đúng bằng audio, nghe được tiếng.

---

### Phase 2 — Visualizer sóng âm (audio-reactive)
- [x] `src/components/Visualizer.tsx`: dùng `useAudioData(audioSrc)` + `visualizeAudio()` lấy mảng biên độ theo frame, vẽ ra các thanh/sóng.
- [x] Phong cách: **kiểu doodle** — nét vẽ `COLORS.ink` navy đậm + viền trắng (đúng chất sticker), làm mượt giá trị (trung bình trượt vài frame) để không nhấp nháy gắt; dùng `numberOfSamples` ~32–64; đối xứng qua trục để trông cân.
- [x] Bố cục cho 9:16: visualizer dạng sóng mảnh ở 1/4 dưới khung, **không che caption**; cho 16:9 nằm 1/3 dưới.
- [x] **Không dùng vàng** cho nét visualizer vì trùng `bg`.

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

**Acceptance:** Visualizer nhảy theo to/nhỏ của giọng nói, mượt, không giật, nét doodle navy + viền trắng. Khi audio im lặng thì sóng lặng.

---

### Phase 3 — Transcribe tự động (Whisper local)
- [x] `scripts/setup-whisper.ts`: dùng API của `@remotion/install-whisper-cpp`:
  - `installWhisperCpp({to: './whisper.cpp', version: '...'})`
  - `downloadWhisperModel({folder: './whisper.cpp', model: process.env.WHISPER_MODEL ?? 'medium'})`
  Idempotent — chạy lại không hỏng.
- [x] `scripts/transcribe.ts`: nhận đường dẫn audio →
  1. **Cache check:** nếu `tmp/<name>.json` đã tồn tại và `mtime` mới hơn audio thì in `[cache] skip` và return — không chạy whisper lại.
  2. Convert sang WAV 16kHz mono nếu cần (whisper.cpp yêu cầu), ghi `tmp/<name>.wav` (hoặc đọc trực tiếp từ `tmp/<name>.normalized.16k.wav` ở Phase 7 nếu đã có).
  3. Gọi `transcribe({...})` từ `@remotion/install-whisper-cpp` với `language: 'vi'`, `tokenLevelTimestamps: true`.
  4. Ghi nguyên `TranscriptionJson` ra `tmp/<name>.json` — **không đổi schema**, để Phase 4 dùng `toCaptions()` của `@remotion/captions` parse trực tiếp.

**Acceptance:** Chạy `tsx scripts/transcribe.ts ./input/x.mp3` lần 1 ra JSON đúng schema Remotion; chạy lại lần 2 thấy `[cache] skip`. Mở JSON kiểm tra timestamp khớp audio bằng tai (đoạn đầu, đoạn giữa, đoạn cuối).

---

### Phase 4 — Caption chạy theo lời nói
- [x] `src/components/Captions.tsx`: load transcript bằng `delayRender()` + `fetch(staticFile(transcriptSrc))` + `continueRender()`. Tránh truyền cả transcript qua props (quá nặng).
- [x] Dùng `toCaptions()` của `@remotion/captions` parse từ `TranscriptionJson` của whisper.cpp → mảng `Caption[]`. Sau đó dùng `createTikTokStyleCaptions()` (hoặc tự gom theo câu nếu muốn caption dài hơn 1-2 từ) để chia thành các "page" hiển thị.
- [x] **Style caption (BẮT BUỘC kiểu sticker, không phải kiểu meme viền đen):**
  - Chữ `COLORS.ink` (navy) đặt trong **thẻ/bong bóng sticker trắng bo tròn**: `background: COLORS.white`, `border-radius: 24-32px`, padding rộng, `outline: 4px solid COLORS.ink` (hoặc shadow nhẹ navy), font body weight 500-600.
  - Từ được nhấn (word-level highlight) tô `accentRed`.
  - Pop-in bằng `spring()` + fade out nhẹ giữa các page caption. Vui nhộn nhưng vẫn rõ chữ.
  - Nằm trong `SAFE_ZONE`, căn giữa, max-width = `WIDTH - 2*SAFE_ZONE.left`.
  - Caption tự **ẩn trong khoảng Hook đang chạy** (kiểm tra frame range của Hook để tránh đè).
- [x] An toàn: nếu `transcriptSrc` undefined hoặc fetch lỗi → Captions return `null`, video vẫn render được.

**Acceptance:** Caption hiện đúng câu khớp thời điểm trong audio, đổi mượt, không đè lên visualizer/sticker, đúng kiểu sticker trắng bo tròn. Xoá prop `transcriptSrc` thì video vẫn render OK (không caption).

---

### Phase 5 — Lớp hình ảnh sticker/doodle vẽ bằng Remotion (Hướng A thuần)

> **Định hướng chính (chốt sau khi pivot khỏi AI image / stock loop):** Toàn bộ hình ảnh nền **vẽ bằng SVG trong Remotion** — không tải clip, không gọi AI, không cache asset ngoài. Chi tiết thư viện sticker/doodle + công thức cảnh ở **Mục 11**. Vì tự vẽ nên style luôn 100% đúng brand và đồng nhất sẵn — KHÔNG cần lớp cohesion overlay.

#### 5.A Background

- [ ] `src/components/Background.tsx`: nền phẳng màu `bg` (vàng) — hoặc `bgAlt` (kem) cho cảnh mood `contemplative` — phủ kín khung.
- [ ] Phủ thêm **doodle trôi rất nhẹ** ở rìa (squiggle, sparkle, đường chấm, ngôi sao) — mật độ THƯA (5–8 cái cho cả khung), animation chậm bằng `Math.sin(frame / 90)`, KHÔNG đè lên vùng caption (bottom safe-zone).

#### 5.B Sticker & doodle library

- [ ] `src/components/stickers/`: dựng **thư viện component SVG tái dùng** (Mục 11.1). Mỗi sticker:
  - Nét `COLORS.ink` (navy) đậm + viền trắng + mảng phẳng màu thương hiệu.
  - **KHÔNG** gradient, **KHÔNG** đổ bóng nặng, **KHÔNG** CSS filter (đắt khi render 30k frame).
  - Props chung `{ color?: string; scale?: number; delay?: number; x: number; y: number }`.
  - Animation: pop-in `spring()` (delay so le các sticker trong cùng cảnh), sau đó bob/twinkle nhẹ theo `Math.sin(frame / 60 + delay)`.
- [ ] `src/components/doodles/`: doodle ngắn (squiggle, sparkle, mũi tên, gạch chân, đường chấm, mây, confetti) — cùng API props, animation drift/twinkle chậm.

#### 5.C SceneLayer router

- [ ] `src/components/SceneLayer.tsx`: nhận `Scene` hiện tại (từ episode plan ở 5.E), chọn 1 **scene recipe** trong `scenes/` (PodcastDesk/Idea/Connection/Crowd/InnerSelf/Choice/Knowledge — Mục 11.2).
- [ ] **Cross-fade ~1s** giữa các cảnh — `interpolate()` opacity ở mép, không cắt khô.
- [ ] **Fail an toàn:** thiếu/không khớp `sceneType` → render `PodcastDesk` (mặc định), không sập render.

#### 5.D Scene recipes

- [ ] `src/components/scenes/`: dựng **5–7 công thức cảnh** (Mục 11.2). Mỗi cái:
  - Là một bố cục cố định của 2–4 sticker + vài doodle quanh chúng.
  - Nhận props **giống nhau giữa các scene**: `{ accentColor, mood, progress, audioLevel }` — để VisualLayer hoán đổi tự do.
  - Có khoảng trống ở vùng dưới (cho caption sticker) và góc phải trên (cho watermark).
  - Có thể điều biến nhẹ scale/opacity sticker theo `audioLevel` để "thở" cùng giọng nói (vd Mic ở `PodcastDesk` to lên chút khi giọng to).

#### 5.E Episode plan — bộ não nối nội dung với cảnh

- [ ] `src/scenes.ts`: hàm pure:
  ```ts
  type Scene = {
    startMs: number;
    endMs: number;
    mood: MoodKey;
    sceneType: SceneType;   // "PodcastDesk" | "Idea" | "Connection" | ...
    text: string;           // text gộp của đoạn (để debug + override mood thủ công)
  };
  function splitScenes(transcript): Scene[]
  function pickMood(text: string): MoodKey
  function pickScene(text: string): SceneType   // tra bảng từ khoá Mục 11.3
  ```
- [ ] **Nhịp đổi cảnh cho video dài:**
  - Min duration **8s** (không vụn) / max **120s** (chống chán) — mặc định 45–90s/cảnh.
  - Cắt theo khoảng nghỉ (gap ≥ 0.6s giữa các từ) + giới hạn max.
  - Cho podcast 15–20 phút → ~15–25 cảnh tổng.
- [ ] `scripts/plan-episode.ts`: đọc transcript → ghi `tmp/<name>.plan.json` cấu trúc:
  ```json
  {
    "scenes": [
      {"startMs": 0, "endMs": 52000, "mood": "positive", "sceneType": "PodcastDesk", "text": "..."},
      {"startMs": 52000, "endMs": 98000, "mood": "social", "sceneType": "Connection", "text": "..."}
    ]
  }
  ```
- [ ] **Cho phép sửa tay JSON** trước render: user mở file đổi `sceneType`/`mood`/`startMs` thoải mái → render lại không cần đụng code. Phase 8 detect mode: nếu user đã sửa (so với version auto), **không ghi đè**.
- [ ] Tôn trọng `episode.sceneOverrides` từ episode config (nếu có) — apply sau khi auto plan, trước khi ghi file.

#### 5.F Cấm anti-pattern (Claude Code đọc kỹ)

- **KHÔNG** dùng `<OffthreadVideo>`, `<Img>` từ asset ngoài, fetch ảnh AI.
- **KHÔNG** dùng `filter: blur()`, `box-shadow: ... large`, SVG `<filter>` nặng — đắt khi nhân với 30k frame.
- **KHÔNG** rắc sticker dày như thumbnail. Nền chạy 20 phút phải THƯA: mỗi cảnh chỉ 2–4 sticker + vài doodle.
- **KHÔNG** tạo `CohesionOverlay` (gradient/grain/tint) — pure SVG đã đồng nhất sẵn, thêm overlay làm tối nền vàng signature.

**Acceptance:**
- Render 1 đoạn vài cảnh thấy:
  - Nền vàng + doodle trôi nhẹ ở rìa, không đè caption.
  - Mỗi cảnh khác nhau hiển thị scene recipe khác (PodcastDesk → Idea → Connection ...) với 2–4 sticker phẳng đúng tông.
  - Cross-fade 1s giữa cảnh mượt.
  - Caption sticker đọc rõ trên mọi cảnh.
  - Tổng thể vui tươi, đúng tông thumbnail kênh.
- Hoàn toàn KHÔNG có asset ngoài (`assets/loops/`, `assets/images-cache/` — nếu còn từ hướng cũ → để Phụ lục Mục 13, không link trong code).
- Sửa `tmp/<name>.plan.json` đổi `sceneType` → render lại thấy đổi.

**Thứ tự triển khai (đã chốt):**
1. `theme.ts` + `Background.tsx` (nền vàng + doodle drift) — video hết "nền trống" ngay.
2. Thư viện sticker + doodle (~10 sticker + 6 doodle cơ bản, Mục 11.1).
3. 3–4 scene recipe chính: PodcastDesk, Idea, Connection, InnerSelf — phủ phần lớn nội dung.
4. `splitScenes` + `pickScene` từ bảng từ khoá (Mục 11.3) → cross-fade.
5. Thêm scene recipe còn lại (Crowd, Choice, Knowledge) khi cần.

---

### Phase 6 — Bookend: Intro / Hook / Watermark / Outro (nhận diện)

Layer "khung" cho mọi video — đây là phần xây thương hiệu kênh và quyết định 3 giây giữ chân Facebook.

- [x] `src/components/IntroCard.tsx`: frame 0 → ~2.5s. Hiển thị:
  - Logo (`theme.BRAND.logoSrc`) căn giữa, fade in từ frame 10.
  - Tên kênh (`channelName`, display font 64px, `COLORS.ink`) bên dưới logo.
  - `episode.title` (display 48px, `COLORS.ink`) + `#<episodeNumber>` (body 36px, `COLORS.ink` opacity 0.6) — fade in muộn hơn ~15 frame.
  - Toàn bộ cross-fade sang nội dung chính trong ~12 frame cuối.
  - Ẩn nếu `episode.showIntro === false`.
- [x] `src/components/Hook.tsx`: ngay sau Intro, kéo dài ~3.5s. Hiển thị `episode.hook`:
  - Display font Baloo 2, 88px (theo `TYPE_SCALE.hook`), `COLORS.ink`, căn giữa frame.
  - **Bọc trong sticker trắng bo tròn lớn** (như caption nhưng đậm hơn) để giữ phong cách kênh.
  - Nằm trong `SAFE_ZONE`. Max 2 dòng — nếu dài quá, giảm size xuống 72px (logic trong component).
  - Caption thường tạm ẩn ở khoảng này (Captions tự check frame range của Hook).
  - Bỏ qua nếu `episode.hook == null` → vào thẳng caption.
- [x] `src/components/Watermark.tsx`: hiện xuyên suốt **sau Intro đến trước Outro**:
  - Góc trên-phải, `top: SAFE_ZONE.top + 20`, `right: SAFE_ZONE.right`.
  - `theme.BRAND.channelName` (28px body, `COLORS.ink` opacity 0.45) + logo nhỏ bên cạnh.
  - Vị trí cố định, không animate (đỡ phân tâm).
- [x] `src/components/OutroCard.tsx`: ~4s cuối video.
  - Fade out nội dung chính + BGM giảm dần.
  - Logo lớn + `theme.BRAND.cta` ("Theo dõi để xem thêm") display 56px + `channelName` body 36px.
  - Cross-fade vào, giữ tĩnh, không CTA động (giữ phong cách trầm cuối, dù sticker vẫn vui).
  - Ẩn nếu `episode.showOutro === false`.
- [x] **Sequencing:** `Video.tsx` dùng `<Sequence>` để layer các phần theo frame range. Hook + Intro KHÔNG đụng audio — audio đã chạy từ frame 0.

**Acceptance:** Render 1 episode đầy đủ thấy: 2.5s intro với title → 3.5s hook to giữa khung trong sticker trắng → nội dung chính (sticker scene + visualizer + caption + watermark góc) → 4s outro CTA. Sửa `title`/`hook` trong `episode.json`, render lại thấy đổi đúng. `showIntro: false` thì bỏ intro nhưng audio + duration vẫn đúng.

---

### Phase 7 — Xử lý âm thanh (loudness normalization + BGM ducking)

- [x] `scripts/process-audio.ts`: tiền xử lý audio TRƯỚC khi vào pipeline render.
  1. **Loudness normalization** sang `-16 LUFS` (Facebook khuyến nghị ~-14 LUFS nhưng -16 an toàn không bị FB nén thêm). Dùng ffmpeg `loudnorm` filter **2-pass** (pass 1 đo, pass 2 áp dụng — chất lượng tốt hơn 1-pass).
  2. Convert sang WAV 16kHz mono (whisper cần) cho transcribe, đồng thời ghi bản 48kHz stereo cho render.
  3. Output: `tmp/<name>.normalized.16k.wav` (cho transcribe) + `tmp/<name>.normalized.48k.wav` (cho render).
  4. Cache theo mtime giống Phase 3.
- [x] BGM ducking — thực hiện trong Remotion (không pre-mix trong ffmpeg để dễ tune):
  - `src/components/BGMTrack.tsx`: render `<Audio src={staticFile(bgmSrc)} volume={f => ...} loop />`.
  - Volume function: tại mỗi frame, kiểm tra xem có caption đang active không (check qua transcript đã load):
    - Có lời → `volume = baseVolume * 0.35` (~9dB ducking).
    - Im lặng → `volume = baseVolume`.
  - Smooth bằng `interpolate()` với cửa sổ ~150ms (~4-5 frame ở 30fps) để tránh giật. Tham khảo `Audio` example trong Remotion docs về `volume` callback.
  - `baseVolume = dbToGain(episode.bgmVolumeDb ?? -28)`.
- [x] Nếu `episode.bgm == null` → `BGMTrack` không render. Pipeline vẫn chạy bình thường.
- [x] Trong outro (4s cuối), `BGMTrack` fade out toàn bộ về 0.

**Acceptance:** Đo audio đầu ra bằng `ffmpeg -i output/x.mp4 -af ebur128 -f null -` thấy integrated loudness ~-16 LUFS. Bật BGM thấy nhạc lùi xuống khi có lời, lên lại khi im lặng, không giật. Nhiều tập render ra to bằng nhau.

---

### Phase 8 — Orchestrator `make` (tự động hoá đầu-cuối)
- [x] `scripts/make.ts`: nhận 1 đối số đường dẫn audio + flags optional (`--preview`, `--no-thumb`), tự động:
  1. **Load episode config:** đọc `input/<name>.json`, validate bằng zod. Nếu không tồn tại → tạo template từ tên file + dừng, in hướng dẫn điền `title`/`hook`.
  2. **Process audio** (Phase 7): chuẩn hoá loudness → `tmp/<name>.normalized.48k.wav` + `tmp/<name>.normalized.16k.wav`.
  3. **Transcribe** (Phase 3, cache-aware) trên bản 16kHz → `tmp/<name>.json`.
  4. **Plan episode** (Phase 5.E): `scripts/plan-episode.ts` đọc transcript → ghi `tmp/<name>.plan.json` với `scenes[]` (startMs/endMs/mood/sceneType). **Skip** nếu file đã tồn tại (cho phép sửa tay).
  5. **Copy** audio normalize + transcript + plan + BGM (nếu có) vào `public/`. **Không có** asset image/loop cần copy (Hướng A thuần — pure SVG).
  6. **Ghi props file** `tmp/props-<name>.json` với `{audioSrc, transcriptSrc, planSrc, bgmSrc, episode}` — KHÔNG inline qua `--props='{...}'` (escape shell khổ).
  7. **Preview hay full?**
     - `--preview`: render 480×854 (low-res 9:16), 10s đầu, codec nhanh (CRF cao). Output `output/<name>.preview.mp4`. Dùng để soi lỗi trước khi tốn 5-10 phút render full.
     - Mặc định: render full theo spec Facebook ở Mục 9 (1080×1920, H.264 + AAC 192k, video bitrate ~8Mbps).
  8. Gọi `renderMedia()` của `@remotion/renderer`.
  9. **Thumbnail** (skip nếu `--no-thumb` hoặc preview mode): `renderStill()` ở frame của Hook (~frame 90) → `output/<name>.thumb.jpg`. Đây là cover up Facebook.
  10. **Lock file:** ghi `output/<name>.lock.json`:
     ```json
     {
       "renderedAt": "2026-06-12T...",
       "remotionVersion": "...",
       "themeHash": "sha256:...",
       "episodeHash": "sha256:...",
       "planHash": "sha256:...",
       "whisperModel": "medium",
       "audioHash": "sha256:..."
     }
     ```
     Đủ để biết tập này render từ version nào → tái lập sau này.
  11. Cleanup `public/` (xoá file đã copy vào, giữ logo + brand assets cố định). Giữ `tmp/` để debug.
- [x] `package.json` scripts:
  - `"setup": "tsx scripts/setup-whisper.ts"`
  - `"make": "tsx scripts/make.ts"`
  - `"preview": "tsx scripts/make.ts --preview"`
  - `"studio": "remotion studio"`
- [x] Xử lý lỗi rõ ràng, exit code ≠ 0 + message tiếng Việt: thiếu episode config, file không tồn tại, audio rỗng/lỗi, whisper chưa setup, loudnorm fail, render fail. Mỗi lỗi gợi ý cách sửa.

**Acceptance:**
- `npm run preview -- ./input/test.mp3` ra file ~10s low-res nhanh (<30s render).
- `npm run make -- ./input/test.mp3` ra `output/test.mp4` full + `output/test.thumb.jpg` + `output/test.lock.json`. Mở video đủ 6 lớp (intro → hook → sticker scene + visualizer + caption + watermark → outro) khớp audio, to đều, BGM ducking đúng.
- Chạy lần 2 cùng audio thấy transcribe `[cache] skip`, plan-episode `[cache] skip`.
- Sửa `episode.json` (đổi `title`), chạy lại thấy intro/thumbnail đổi.
- Sửa `tmp/<name>.plan.json` (đổi `sceneType` của 1 cảnh), chạy lại thấy cảnh đó render scene khác.

---

### Phase 9 — Hoàn thiện & tài liệu
- [x] `README.md`: hướng dẫn:
  - Setup 1 lần (install, setup whisper, tạo logo brand)
  - Quy trình hằng ngày 3 bước (audio + episode.json + make)
  - Schema episode.json (link sang Mục 4.1)
  - Schema plan.json (link sang Mục 5.E + Mục 11.2 — bảng sceneType)
  - Đổi FORMAT dọc/ngang, đổi brand (màu/font/logo) trong `theme.ts`
  - Đổi Whisper model qua env
  - Cách thêm scene recipe mới (chỉ cần thêm 1 file trong `scenes/` + đăng ký trong router + bảng từ khoá Mục 11.3)
  - Cách sửa transcript thủ công nếu whisper sai (sửa `tmp/<name>.json` trước khi render, nhưng make sẽ ghi đè — workaround: copy ra `tmp/<name>.manual.json` + chạy với env `TRANSCRIPT_OVERRIDE=...`)
- [x] Kiểm tra render full 1 episode thật từ đầu đến cuối, up thử lên Facebook (private post) để verify safe-zone không bị che.
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

**Sửa tay scene plan (tuỳ chọn):** sau bước 2, có thể chạy `npm run make -- ... --plan-only` để chỉ sinh `tmp/<name>.plan.json` rồi mở sửa `sceneType` từng cảnh trước khi render full.

---

## 7. Nguyên tắc cho Claude Code khi code

- **Tách config khỏi logic:** mọi thứ về phong cách (màu, font, format, tốc độ animation) gom vào `theme.ts` để chỉnh nhanh, không phải sửa rải rác.
- **Cấm hardcode hex** trong JSX/SVG/CSS — luôn đọc từ `theme.COLORS` / `theme.MOOD_ACCENTS`.
- **Cấm asset ngoài** trong pipeline chính: không tải clip, không fetch ảnh AI, không `<OffthreadVideo>` từ stock — vẽ bằng SVG/Remotion. (Asset cho phép: logo brand đã commit, font Google qua `@remotion/google-fonts`, BGM tự chọn.)
- **Mọi thành phần phải fail an toàn:** thiếu transcript / audio lỗi / sceneType lạ thì component tự ẩn / fallback `PodcastDesk`, không làm sập cả render.
- **Không hardcode độ dài video** — luôn suy ra từ audio qua `parseMedia` ở `calculateMetadata`.
- **Ưu tiên tối giản hiệu năng** — tránh CSS `filter: blur()`, `box-shadow` lớn, SVG `<filter>` nặng (đắt × 30k frame). Particle/node giới hạn vài trăm.
- **Animation dịu, không phô** — phong cách kênh là vui sáng nhưng vẫn đọc rõ lời nói, không cướp chú ý.
- Mỗi Phase xong **tự test bằng đúng Acceptance** rồi mới sang phase sau; báo lại kết quả từng phase.

## 8. Checkpoint preview giữa pipeline

Sau **Phase 2** (visualizer), **Phase 5** (sticker scene), và **Phase 6** (Bookend) — bắt buộc mở `npm run studio` test thủ công với 1 audio thật **trước khi** sang phase tiếp. Sau Phase 8 (orchestrator có sẵn), dùng `npm run preview` thay cho studio để check toàn cục nhanh.

Đừng đợi Phase 9 mới render full mới phát hiện cảnh giật / caption sai vị trí / hook bị cắt — sửa lúc đó tốn gấp đôi.

## 9. Export spec — chuẩn cho Facebook

| Thuộc tính | Giá trị |
|---|---|
| Container | `mp4` |
| Video codec | `h264` (yuv420p) |
| Resolution (Reels/Stories) | 1080×1920 dọc (**mặc định**) |
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
- Whisper với **tiếng Việt** ở model `medium` thường tốt nhưng vẫn có thể sai chính tả / timestamp lệch nhẹ → cho phép nâng cấp lên `large-v3` qua env, và cho phép sửa tay file `tmp/<name>.json` trước khi render nếu cần độ chính xác cao (chạy lại `make` sẽ ghi đè — workaround: copy bản sửa tay sang chỗ khác, hoặc tách `transcribe` thành step riêng).
- Render video dọc 1080×1920 dài vài phút có thể tốn thời gian/CPU → concurrency đã set ở Phase 0, có thể override bằng `--concurrency` khi gọi `make`.
- `useAudioData` fetch file audio qua HTTP từ Remotion bundler → file phải nằm trong `public/`, không phải absolute path tuỳ ý. Đã xử lý ở Phase 8 (copy vào `public/`).
- `parseMedia` không support được mọi container — nếu input là `.m4a`/`.ogg` lạ, fallback sang `getAudioDurationInSeconds` qua ffprobe trong `make.ts` rồi pass `durationInFrames` xuống làm prop.
- **Video 15–20 phút** (~27–36k frame): tránh `filter: blur()`, `box-shadow` lớn, SVG filter nặng — đắt khi nhân với chục nghìn frame. Particle/node giới hạn vài trăm. Cân nhắc `fps = 24` thay vì 30 cho nội dung tĩnh lặng (giảm ~20% frame).
- **`useAudioData` nạp toàn bộ waveform** vào RAM — 20 phút thường ổn trên M-series, nhưng nếu OOM thì giảm sample rate khi phân tích.
- **Sticker hết "vốn từ"** — nếu kênh đa dạng chủ đề mà chỉ 5–7 scene recipe → cảnh dễ lặp. Giải pháp: thêm scene type mới khi gặp chủ đề thiếu (xem Mục 11.4); KHÔNG quay lại hướng AI/stock chỉ vì hết ý tưởng — sticker mới luôn nhanh hơn debug AI prompt.
- **Nhịp đổi cảnh sai** → cảnh đứng yên quá lâu chán hoặc đổi quá nhanh rối. Tuning ở `splitScenes()` — bắt đầu với min 8s / max 90s, tinh chỉnh sau khi render thử.

---

## 11. Thư viện sticker/doodle & công thức cảnh (HÌNH ẢNH CHÍNH của video)

> Đây là nội dung thị giác chính của Hướng A thuần, vẽ bằng SVG trong Remotion. Triết lý: một **bộ component sticker + doodle tái dùng** (vốn từ vựng đồ hoạ của kênh), rồi mỗi "cảnh" chỉ là một **bố cục** ghép vài món lại + animation nhẹ. Tự vẽ nên luôn đúng brand và đồng nhất sẵn — không cần overlay đồng nhất.

### 11.1 Thư viện cần dựng

**Sticker (component SVG trong `components/stickers/`)** — vốn từ vựng lấy từ thumbnail kênh:

| Sticker | Dùng cho cảnh | Ghi chú |
|---|---|---|
| `Mic` | PodcastDesk | Mic studio + chân đỡ |
| `Headphones` | PodcastDesk | Tai nghe phẳng |
| `CoffeeMug` | PodcastDesk, Knowledge | Cốc khói nhẹ |
| `Books` | Knowledge | Chồng sách 2-3 cuốn |
| `Phone` | Connection | Smartphone với bong bóng thoại |
| `SpeechBubble` | Connection, Idea | Bong bóng thoại (nhận text/icon con qua prop) |
| `Lightbulb` | Idea | Bóng đèn + sparkle |
| `Heart` / `LikeThumb` | Connection, InnerSelf | Tim hoặc thumb up |
| `SmileyFace` | Crowd, InnerSelf | Mặt cười tròn |
| `Plant` | Knowledge, healing | Cây xanh nhỏ (chậu hoặc lá) |
| `NetworkDots` | Connection | Các chấm nối nhau bằng đường mảnh |
| `Brain` | InnerSelf | Não cách điệu phẳng |
| `Mask` | InnerSelf | Mặt nạ (ẩn dụ bản ngã) |
| `Signpost` | Choice | Biển chỉ đường nhiều hướng |
| `QuestionMark` | Idea, Choice | Dấu hỏi to |
| `Star` | nhiều cảnh | Ngôi sao đặc, dùng nhấn |

Props chung: `{ x: number; y: number; scale?: number; delay?: number; color?: string; flip?: boolean }`.

**Doodle (component SVG trong `components/doodles/`):** doodle ngắn rắc quanh sticker, có animation drift/twinkle chậm.

| Doodle | Mô tả |
|---|---|
| `Squiggle` | Đường lượn sóng ngắn |
| `Sparkle` | Hoa văn 4 tia |
| `StarSmall` | Ngôi sao nhỏ outline |
| `Arrow` | Mũi tên cong hoặc thẳng |
| `Underline` | Gạch chân lượn |
| `DottedPath` | Đường chấm |
| `Cloud` | Đám mây nhỏ |
| `Confetti` | Mảnh giấy vụn (dùng tiết chế cho cảnh `positive`/`energetic`) |

Props giống sticker: `{ x, y, scale?, delay?, color? }`.

### 11.2 Công thức cảnh (`components/scenes/`) — 5–7 cái

Mỗi scene recipe = bố cục cố định 2–4 sticker + vài doodle quanh chúng, props giống nhau `{ accentColor, mood, progress, audioLevel }`.

| # | Tên | Mood phù hợp | Bố cục mô tả |
|---|---|---|---|
| 1 | **PodcastDesk** *(mặc định, fallback)* | positive, mọi mở đầu | Mic (giữa trái) + Headphones (góc) + CoffeeMug (góc dưới) + Squiggle sóng âm + Sparkle. Mic scale lên nhẹ theo `audioLevel`. |
| 2 | **Idea** | positive, energetic | Lightbulb to (giữa) + Sparkle xung quanh + QuestionMark nhỏ + StarSmall. Bóng đèn pulse nhẹ. |
| 3 | **Connection** | social | 2-3 Phone/SpeechBubble nối nhau bằng NetworkDots + Heart bay + Arrow. |
| 4 | **Crowd** | social | 5-7 SmileyFace xếp lưới, 1 cái khác màu (accent) nổi bật + Squiggle bay. |
| 5 | **InnerSelf** | contemplative, healing | Brain hoặc Mask (giữa) + Heart nhỏ + SpeechBubble với "..." + Cloud trôi. Nền cân nhắc `bgAlt` kem. |
| 6 | **Choice** | mọi mood | Signpost (giữa) + 3 Arrow chỉa hướng khác + QuestionMark + DottedPath. |
| 7 | **Knowledge** | contemplative, healing | Books + CoffeeMug + Plant + Sparkle. Nền `bgAlt` kem. |

> **Ưu tiên dựng trước:** PodcastDesk, Idea, Connection, InnerSelf (phủ ~80% nội dung triết/tâm lý). Crowd, Choice, Knowledge thêm sau.

### 11.3 Bảng từ khoá → sceneType (cho `pickScene()`)

| Chủ đề đoạn nói (keyword) | sceneType |
|---|---|
| (mặc định, không match) / "podcast", "kể chuyện", "hôm nay", "chào" | `PodcastDesk` |
| "ý tưởng", "khái niệm", "nhận thức", "à há", "phát hiện", "tỉnh ngộ" | `Idea` |
| "kết nối", "quan hệ", "giao tiếp", "yêu", "tình bạn", "lan truyền", "mạng" | `Connection` |
| "đám đông", "xã hội", "chuẩn mực", "cá nhân vs tập thể", "công chúng" | `Crowd` |
| "cảm xúc", "ý thức", "vô thức", "bản ngã", "chữa lành", "tổn thương", "nội tâm", "im lặng" | `InnerSelf` |
| "lựa chọn", "tự do ý chí", "quyết định", "ngã ba", "hướng đi", "nghịch lý" | `Choice` |
| "sách", "tri thức", "học", "suy ngẫm", "đọc", "thiền" | `Knowledge` |

Hàm `pickScene(text): SceneType` — đếm match keyword, scene nào nhiều keyword nhất thắng; tie → `PodcastDesk`.

### 11.4 Thêm scene recipe mới

Quy trình thêm khi gặp chủ đề thiếu:
1. Tạo file `src/components/scenes/<TenScene>.tsx` — component nhận props giống các scene khác.
2. Thêm vào `SceneType` union trong `theme.ts` / `scenes.ts`.
3. Đăng ký trong router `SceneLayer.tsx`.
4. Thêm hàng trong bảng Mục 11.3 với keyword tương ứng.
5. Render preview, tinh chỉnh bố cục.

KHÔNG quay lại hướng AI/stock chỉ vì hết ý tưởng — sticker mới nhanh hơn debug prompt.

### 11.5 API đồng nhất giữa các scene recipe

```ts
type SceneProps = {
  mood: MoodKey;
  accentColor: string;       // = MOOD_ACCENTS[mood]
  progress: number;          // 0..1 trong cảnh — dùng cho intro/outro animation của scene
  audioLevel?: number;       // 0..1 biên độ audio frame hiện tại (optional, dùng cho sticker "thở")
};
```

Lỗi/thiếu dữ liệu → return `null` hoặc fallback `PodcastDesk`, không sập render.

---

## 12. Lưu ý cho video dài (15–20 phút) — QUAN TRỌNG

> Bối cảnh: video **9:16 dọc (1080×1920)** đăng trên feed/Reels Facebook, render trên **máy Mac M-series**. Độ dài 15–20 phút đổi vài giả định, cần tuân thủ các điểm dưới.

### 12.1 Render (máy M-series mạnh — không phải nỗi lo lớn, nhưng vẫn tối ưu)
- Đặt **`concurrency`** trong `remotion.config.ts` theo số nhân (M-series để Remotion tự dò hoặc set ~số performance core). Render 20 phút trên M-series ở mức scene tối giản (sticker SVG) thường trong khoảng chấp nhận được cho làm hằng ngày.
- **Ngân sách độ phức tạp scene (bắt buộc):** tránh CSS `filter: blur()`, `box-shadow` lớn, SVG filter nặng — chúng đắt kinh khủng khi nhân với hàng chục nghìn frame. Particle/node giới hạn số lượng hợp lý (vài trăm, không phải vài nghìn).
- Cân nhắc **`fps = 24`** thay vì 30 cho nội dung tĩnh lặng: giảm ~20% số frame phải render mà mắt gần như không nhận ra khác biệt với loại animation chậm này.

### 12.2 Bước preview trước khi render full
- Đã có ở Phase 8: `npm run preview -- ./input/x.mp3` chỉ render 10s đầu ở 480×854 — soi bố cục/màu/caption trước khi render full 20 phút.

### 12.3 Chống nhàm chán (đây là rủi ro số 1 của video dài)
- Tuân thủ nhịp đổi cảnh **45–90 giây/lần** đã ghi ở Phase 5. Một bố cục sticker đứng yên suốt 20 phút sẽ chán.
- Đảm bảo logic cắt đoạn transcript tạo đủ số cảnh; nếu audio ít khoảng nghỉ thì cắt bổ sung theo số câu/độ dài tối đa mỗi cảnh (~120s).
- Xoay vòng scene type + đổi nhẹ vị trí/màu nhấn sticker giữa các lần dùng cùng `sceneType` (truyền `delay` khác → animation lệch pha), tránh lặp y hệt sát nhau.

### 12.4 Caption cho lời nói dài
- 15–20 phút lời nói = rất nhiều chữ → chunk caption theo cụm ngắn (vd ≤ 2 dòng, hiển thị 2–4 giây/cụm), không nhồi cả câu dài.
- Tiếng Việt model `medium` dễ sai trên đoạn dài → giữ vững đường "sửa tay transcript trong `tmp/` trước khi render".

### 12.5 Bộ nhớ & xuất file
- `useAudioData` nạp toàn bộ waveform 20 phút vào RAM — thường ổn trên M-series, nhưng nếu gặp vấn đề bộ nhớ thì cân nhắc giảm sample rate khi phân tích.
- File mp4 xuất ra cỡ ~150–350MB ở 9:16 1080p, 20 phút — Facebook nhận tốt. Xuất chuẩn H.264 + AAC.

---

## 13. Phụ lục — nâng cấp tuỳ chọn về sau (KHÔNG làm bây giờ)

> Pipeline chính đã chốt là Hướng A thuần (pure SVG sticker/doodle, local, free). Các mục dưới chỉ ghi lại để tham khảo nếu sau này muốn nâng cấp — **không đưa vào bản đầu**, code các script này (`scripts/gen-images.ts`, `scripts/enrich-prompts.ts`, `assets/images-cache/`, `assets/loops/`) nếu còn từ phiên bản cũ thì để nguyên ở root nhưng KHÔNG link vào pipeline chính.

### 13.1 Stock video loop (Hướng A cũ — bỏ)
- Tải clip Pexels/Pixabay theo mood, dùng `<OffthreadVideo>` làm nền cảnh.
- **Lý do bỏ:** style "trừu tượng" của stock không hợp tông sticker phẳng của kênh — phải dùng `CohesionOverlay` (gradient + grain + tint) để gắn kết, mà overlay làm tối nền vàng signature → mất chữ ký kênh. Sticker SVG tự vẽ đã 100% on-brand không cần overlay.

### 13.2 Ảnh AI sinh theo cảnh (Hướng B cũ — bỏ)
- Đã thử qua image-gen API (Gemini/Imagen) ở commit `63d9d56` (`feat(phase-5-v2): kịch bản phim — transcript → AI image per scene`).
- **Lý do bỏ:**
  - Khó giữ nhất quán với style sticker phẳng — mỗi ảnh AI một kiểu, dù đã ép style suffix cố định.
  - Tốn phí hằng ngày (mỗi tập ~15–25 cảnh × N retry = nhiều request).
  - Cần `CohesionOverlay` để gắn kết → vẫn vấn đề tối nền vàng như Hướng A.
  - Phụ thuộc API key, không offline hoàn toàn.
- Nếu sau này quay lại: bắt buộc style suffix cố định + ép tỷ lệ 9:16 + cache theo `sha256(prompt)` + negative prompt loại "realistic / neon / dark / people / text". Vẫn cần `CohesionOverlay`.

### 13.3 CohesionOverlay (gradient + grain + tint) — bỏ
- Lớp đồng nhất 3 thành phần (tint thương hiệu + grain noise + gradient tối bottom) phủ lên stock/AI để gắn về cùng tông.
- **Lý do bỏ:** Hướng A thuần (SVG sticker) đã đồng nhất sẵn vì tự vẽ → overlay này không cần thiết; mà overlay tối làm mất nền vàng signature.

### 13.4 Sticker AI rời (local qua ComfyUI) — chưa làm
- Sinh vài sticker đồ vật phẳng (nền trong suốt) bằng SDXL/Flux local, ghép vào thư viện thay vì vẽ tay.
- Vẫn free, nhưng cài đặt phức tạp và phải lọc cho khớp style → để sau, khi thư viện SVG hand-drawn không đủ vốn.

### 13.5 Image-to-video (LTX-Video/SVD local) — chưa làm
- Nặng, clip chỉ ~5s, chỉ hợp làm thủ công cho 1 cảnh hero mở đầu, không tự động hằng ngày.
