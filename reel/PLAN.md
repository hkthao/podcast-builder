# PLAN — Pipeline video reel (gia đình · gia phả · văn hoá)

> Kế hoạch cho nhánh nội dung reel ngắn, **cô lập** khỏi Podcast Studio đang chạy.
> Cập nhật: 2026-07-20.

## 1. Mục tiêu

Sản xuất **video reel dọc 9:16, ~4–5 phút, ≤700 từ** cho chủ đề
gia đình – gia phả – văn hoá (ký ức, ông bà, nguồn cội) nhắm khán giả trung niên.
Format: **audio kể chuyện (Gemini TTS) + footage miễn phí + caption + nhạc nền**, ráp bằng **ffmpeg**.
Nội dung là phễu dẫn tới nhu cầu lưu giữ ký ức / gia phả.

## 2. Quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Thời lượng / số từ | ~4–5 phút, ≤700 từ (không viết quá ngắn kẻo thiếu cảm xúc) |
| Khung hình | **9:16 dọc** |
| Nguồn video | Footage miễn phí (Pexels/Pixabay/Mixkit/Videvo) > AI video; AI chỉ cho cảnh quá khứ không quay được |
| Audio | Gemini TTS trên **Google AI Studio web** (KHÔNG gọi API — tốn tiền) |
| Chất giọng | **Dẫn phim tài liệu** — rõ, chuyên nghiệp, bình thường, không chậm, không thủ thỉ |
| Ráp video | **ffmpeg thuần** (không CapCut, không Remotion) |
| Timing | Lấy từ whisper (timestamp thật), audio là master timeline |

## 3. Nguyên tắc cốt lõi

- **Audio là master timeline.** Không cắt audio cho khớp footage — ép footage vào khung audio.
  Footage dài/ngắn/thiếu/thừa đều được, ffmpeg tự cắt/kéo/tái dùng.
- **Mỗi tập tự chứa** trong `episodes/<slug>/`, không dùng chung tmp/output với studio.
- **Giọng khoá cố định cả series** để nhất quán.

## 4. Cô lập với Podcast Studio

- UI reel **gộp vào** studio server: `server/index.ts` import `reel/server/routes.ts`
  (mount `/api/reel`, serve `/reel`). Sửa `reel/server/routes.ts` → tsx watch reload server.
- **Nhưng** align/assemble chạy bằng `spawn npx tsx reel/scripts/...` (KHÔNG import) → sửa
  các script pipeline **không** làm reload server; upload file vào `episodes/**` cũng không.
- Reel chỉ **đọc lại** (import read-only) `shared/transcribe` + `shared/audio`, không sửa.
- Master/final/caption/beats nằm trong `reel/episodes/<slug>/work/`; các bản normalize trung
  gian của `processAudio` vẫn ghi ở `tmp/` root (dùng chung code shared, đặt tên theo slug).

## 5. Quy trình 1 tập

Có 2 cách thao tác — **UI** (tiện) hoặc **CLI**. UI làm được hết bước 2b,3,4,5 dưới.

**Reel UI (trong studio):** chạy `npm run studio` → mở **http://localhost:3000** → sidebar mục
**Reel → Tập reel** → chọn tập → copy prompt TTS → upload/​dán URL footage → bấm Align →
nghe/xem kết quả. (Là React page trong `ui/`, cùng theme studio; footage nhận cả upload lẫn URL.)

```
1. Claude  → episodes/<slug>/script.md    (≤700 từ + 4 khối Gemini TTS)
             episodes/<slug>/shot-list.md  (footage cần + từ khoá)
2a.Bạn     → dán Scene/Sample Context/Speaker/Text vào AI Studio (tách block) → tải nhiều wav
2b.Bạn     → up nhiều part: audio_01.wav, audio_02.wav… vào episodes/<slug>/ (UI tự đánh số)
3. Align   → UI bấm "Align"  |  hoặc  npx tsx reel/scripts/reel-align.ts <slug>
             → work/<slug>.final.wav (loudnorm) + caption.srt + beats.json (timing THẬT,
               chữ lấy từ script.md — KHÔNG dùng chữ whisper sai chính tả)
4. Bạn     → tải footage theo shot-list, đặt tên 01_*, 02_*… (UI upload hoặc bỏ vào footage/)
             (nhạc nền vào reel/assets/music/)
5. Ráp     → UI bấm "Assemble"  |  hoặc  npx tsx reel/scripts/reel-assemble.ts <slug>
             → out/<slug>.mp4 (9:16, caption, nhạc, grain)   ← reel-assemble CHƯA build
```

**reel-align.ts (đã build):** gộp mọi `audio_NN.*` (concat) → `processAudio` (loudnorm 48k
+ 16k cho whisper) → whisper transcribe → **forced-align-lite**: LCS neo từ script.md (đã bỏ
dấu) vào token whisper, nội suy timing cho từ chưa neo. Log tỉ lệ neo; <60% sẽ cảnh báo.

## 6. Cấu trúc thư mục

```
reel/
  PLAN.md            ← file này
  README.md          ← hướng dẫn dùng
  scripts/           reel-align.ts (xong), reel-assemble.ts (CHƯA build)
  server/routes.ts   API /api/reel (mount vào studio server)
  assets/music/      nhạc nền dùng chung
  (UI: React trong ui/src/pages/ReelList.tsx + ReelEpisode.tsx, route /reel + /reel/:slug)
  episodes/
    _TEMPLATE.md     khung chuẩn cho tập mới
    <slug>/
      script.md      4 khối TTS + text
      shot-list.md   footage cần tải
      audio.wav      (bạn bỏ vào)
      footage/       01_*.mp4 …  (bạn bỏ vào)
      work/          caption.srt, beats.json  (align sinh)
      out/           <slug>.mp4
```

## 7. Chuẩn prompt Gemini TTS (rút ra từ thử nghiệm)

UI Speech có 4 trường, mỗi tập **bắt buộc** viết sẵn để copy-paste:

- **Scene**: `A warm, cinematic documentary about <chủ đề>.` (sáng, tránh dusk/dark/old house)
- **Sample Context**: `Clear, warm male documentary narrator... normal natural pace, professional, engaging, not sentimental, not slow. NOT ominous or eerie.`
- **Speaker**: giọng nam chất tài liệu — Iapetus / Orus / Rasalgethi / Sadaltager. Tránh Algenib (khàn). **Đổi từ Aoede (nữ) mặc định.**
- **Speech block**: text tiếng Việt. **Giới hạn AI Studio ~1 phút 30 giây/lần gen (≈ ≤200 từ)**
  → chia lời đọc thành nhiều **PHẦN** ~120–150 từ, cắt ở ranh giới ý. Mỗi phần gắn nhãn
  `**Phần N · audio_0N**` trong script.md; UI reel đọc nhãn để hiện nút copy riêng từng phần.
  Gen từng phần → lưu `audio_01.wav … audio_0N.wav`; `reel-align.ts` tự nối lại theo thứ tự.

### Bẫy đã gặp & cách tránh
0. **Giọng bị cắt giữa chừng** ← 1 lần gen vượt ~1:30. → chia phần ≤ ~150 từ (xem trên).
1. **Nghe như truyện ma** ← giọng quá trầm/khàn + Scene tối. → giọng dẫn tài liệu, Scene sáng, ghi rõ "NOT a ghost story".
2. **Đọc quá chậm** ← "unhurried / slow / meditative / intimate". → "documentary narrator, normal natural pace".
3. **Dừng lâu** ← nhiều dấu "…". → chỉ giữ 1–2 chỗ đắt nhất.
4. Vẫn chậm → tăng tốc lúc ráp bằng ffmpeg `atempo=1.08–1.15` (không đổi cao độ).

## 8. Tooling cần build (ffmpeg)

### `reel/scripts/reel-align.ts`
- Input: `episodes/<slug>/audio.wav`
- Chạy whisper (tái dùng `shared/audio/process-audio` + `shared/transcribe/transcribe`).
- Output: `work/caption.srt` (phụ đề cháy chữ) + `work/beats.json` (câu + start/end thật).

### `reel/scripts/reel-assemble.ts`
- Input: `beats.json` + `footage/` + `assets/music/` + `audio.wav`.
- Mỗi shot: crop/scale 9:16 (footage ngang → crop giữa + nền blur), Ken Burns, trim/loop cho khớp `dur`.
- Ghép concat → overlay `subtitles=caption.srt` → mix nhạc nền (ducking) → film grain (`noise`) → `xfade`.
- Audio gốc trùm master; tham số `atempo` chỉnh tốc độ nếu cần.
- Thiếu clip → tái dùng clip gần nhất; thừa clip → bỏ.
- Output: `out/<slug>.mp4`.

## 9. Trạng thái & việc tiếp theo

- [x] Dựng skeleton `reel/` cô lập
- [x] Tập mẫu `ong-ba-de-lai`: script.md (~560 từ) + shot-list.md (12 shot)
- [x] Template `_TEMPLATE.md` + README + PLAN
- [x] Chốt chuẩn prompt TTS chất phim tài liệu
- [x] Build `reel-align.ts` (gộp nhiều audio_NN + loudnorm + forced-align text chuẩn vào timing whisper)
- [x] Reel UI React trong studio (sidebar Reel → Tập reel): copy prompt TTS theo phần, upload + dán URL footage, **kéo-thả sắp xếp footage + đánh số**, **nhạc nền** (upload/URL/nghe thử, dùng chung), chạy align (SSE log), xem kết quả. Sidebar gọn còn Podcast (Tập, Scene templates) + Reel.
- [x] Audio/Footage hiện **độ dài từng file + tổng**, cảnh báo so khớp footage↔audio (audio là master).
- [x] **Kéo-thả sắp xếp cả audio lẫn footage** (footage: manifest `.order.json`; audio: đổi tên audio_0N theo thứ tự). Footage có **thumbnail + preview video inline**; audio có **nút nghe thử inline**.
- [ ] **Bạn:** gen thử audio → chốt **tên giọng** cuối cùng
- [ ] Ghi giọng đã chốt vào memory + README làm chuẩn series
- [x] Build `reel-assemble.ts` (v1): footage theo .order.json lấp đầy timeline audio (lặp nếu thiếu, cắt cho khớp), cover-crop 1080x1920@30, cháy caption (lower-third), trộn nhạc nền ducking (sidechaincompress), mux audio master. Pre-render segment → concat → 1 pass cuối. CHƯA có: Ken Burns, film grain, xfade.
- [x] Chạy end-to-end tập mẫu ong-ba-de-lai → out/ong-ba-de-lai.mp4 — nghiệm thu OK
- [x] Branding: caption màu logo + font Be Vietnam Pro (font website); logo nhỏ góc trái trong thân
- [x] Intro 3s (cover): logo + "TẬP NN · DÒNG HỌ VIỆT" + tiêu đề (đọc từ H1 + "**Tập:** N" trong script.md)
- [x] Outro 3s: logo + tên app + website donghoviet.thaohk.com; nhạc fade nhỏ dần
- [x] Assemble tách VIDEO/AUDIO 2 pass rồi mux (gộp 1 graph làm audio bị cụt); audio giọng trễ 3s + apad phủ outro
- [x] Đăng bài fanpage: card caption + hashtag + AI gen (reuse /api/llm/social-caption), lưu post.json — layout theo PublishTab podcast
- [ ] Nhân bản cho các tập series tiếp theo

## 10. Ý tưởng series (backlog)

- Điều cuối cùng ông bà để lại không phải là tài sản  ← **đang làm mẫu**
- Nếu ông bà có thể để lại một tin nhắn cho bạn hôm nay
- Bức ảnh cũ có thể kể được bao nhiêu câu chuyện?
- Một gia đình bị thất lạc nhau suốt 50 năm
- Người đầu tiên trong dòng họ mà bạn còn nhớ tên là ai?
