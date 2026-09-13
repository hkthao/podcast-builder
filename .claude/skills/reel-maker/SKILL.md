---
name: reel-maker
description: Tạo một tập reel dọc 9:16 (~3–4 phút) cho series "Dòng Họ Việt" (gia đình · gia phả · ký ức · nguồn cội), theo đúng khuôn tập mẫu reel/episodes/ong-ba-de-lai. Dùng khi user đưa một CHỦ ĐỀ + HOOK (+ gợi ý footage) và muốn Claude viết script.md (4 khối Gemini TTS) + shot-list.md + post.json, rồi hướng dẫn gen audio → align → footage → assemble ra out/<slug>.mp4. Bao gồm chuẩn giọng, các bẫy đã biết và lệnh pipeline.
---

# Reel Maker — series "Dòng Họ Việt"

Biến một **chủ đề + hook** thành một tập **reel dọc 9:16, ~3–4 phút, ≤700 từ**: Claude viết `script.md` + `shot-list.md` + `post.json` → user gen audio trên Google AI Studio → align (timing thật từ whisper) → tải footage → assemble bằng ffmpeg ra `out/<slug>.mp4`.

Khuôn mẫu chuẩn của series là **`reel/episodes/ong-ba-de-lai/`** — luôn đọc lại nó trước khi viết tập mới để giữ giọng văn, độ dài và format nhất quán.

## Nguyên tắc cô lập (đọc trước)
- Thư mục `reel/` **cô lập** với Podcast Studio. `align`/`assemble` chạy bằng `npx tsx reel/scripts/...` (KHÔNG import vào server) → sửa file trong `episodes/**` không làm reload server.
- **Audio là master timeline.** Không cắt audio cho khớp footage — ép footage vào khung audio. Footage thiếu/thừa/dài/ngắn đều được, assemble tự cắt/lặp/tái dùng.
- **Giọng khoá cố định cả series.** Mọi tập dùng cùng một Speaker để nhất quán.

## Quy trình 1 tập (Claude làm bước 1, user làm 2/4, chạy lệnh 3/5)

```
1. Claude → reel/episodes/<slug>/script.md   (tiêu đề + meta + 4 khối Gemini TTS, ≤700 từ)
            reel/episodes/<slug>/shot-list.md (bảng beat → footage → từ khoá)
            reel/episodes/<slug>/post.json    (caption fanpage + hashtag)
2. User   → dán từng "Phần" vào Google AI Studio (Speech) → tải audio_01.wav … audio_0N.wav
            bỏ vào reel/episodes/<slug>/  (UI reel upload lần lượt tự đánh số)
3. Align  → npx tsx reel/scripts/reel-align.ts <slug>
            → work/<slug>.final.wav + work/caption.srt + work/beats.json (timing THẬT)
4. User   → tải footage theo shot-list, đặt tên 01_*.mp4, 02_*… vào footage/
            (nhạc nền dùng chung: reel/assets/music/)
5. Ráp    → npx tsx reel/scripts/reel-assemble.ts <slug>
            → out/<slug>.mp4 (9:16, caption cháy chữ, nhạc ducking, intro/outro branding)
```
Có thể làm hết bước 2/3/4/5 qua **UI**: `npm run studio` → http://localhost:3000 → sidebar **Reel → Tập reel**.

## Bước 1 — Việc của Claude: viết script

### Chọn slug
`slug` = tiêu đề rút gọn, không dấu, gạch nối, không trùng tập cũ. Ví dụ chủ đề "Điều gì thực sự còn lại sau khi một người qua đời?" → `con-lai-sau-100-nam`. Thư mục: `reel/episodes/<slug>/`.

### Công thức script (rút từ tập mẫu ~560 từ)
- **Ngôi kể:** người thật xưng **"Tôi"**, kể về ông/bà/dòng họ mình. Ấm, chân thành, KHÔNG hàn lâm, KHÔNG lên gân.
- **Hook (2 câu đầu):** dùng đúng hook user đưa (hoặc biến tấu sát nghĩa). Câu 1 gợi tò mò/nghịch lý; câu 2 kéo người xem ở lại. Ví dụ mẫu: *"Ông tôi mất đi, không để lại một chỉ vàng nào. Nhưng thứ ông để lại khiến cả dòng họ ngồi lặng đi suốt một buổi chiều."*
- **Một vật thể cụ thể làm trục** (cuốn sổ da sờn, tấm ảnh cũ, tấm bia…). Kể chi tiết giác quan, đừng nói trừu tượng.
- **Cấu tứ 4 nhịp:** (1) mở bằng vật thể + hook → (2) đảo hướng "ta thường nghĩ… nhưng thật ra…" → (3) một câu nói/di sản của ông bà + khoảnh khắc thế hệ sau → (4) chốt + CTA "hãy hỏi, hãy ghi lại khi còn kịp".
- **CTA cuối** luôn hướng về **lưu giữ ký ức / gia phả** (phễu của series), nhẹ nhàng, không quảng cáo lộ.
- **Độ dài:** ~500–650 từ. Chia **4 PHẦN** ~120–150 từ, cắt ở ranh giới ý (mỗi part ≤ ~1 phút 30 để AI Studio không cắt giọng).
- **Dấu "…":** chỉ giữ 1–2 chỗ đắt nhất (nhiều dấu ba chấm → giọng dừng lâu, lê thê).
- **Tránh nhàm series:** đừng lặp lại y hệt vật thể/câu chốt của các tập trước (tập 1 đã dùng "cuốn sổ ghi tên dòng họ" + "Cây có cội, nước có nguồn"). Xoáy góc mới của chủ đề mới.

### Cấu trúc file `script.md` (bám sát `episodes/_TEMPLATE.md`)
```md
# <TIÊU ĐỀ TẬP>            ← in lên thẻ cover 3s đầu

- **Tập:** <N>            ← "TẬP NN · DÒNG HỌ VIỆT" trên cover
- **Format:** reel 9:16, ~3–3,5 phút, giọng nam dẫn phim tài liệu (rõ, không chậm)
- **Số từ:** ~<N> — chia 4 phần cho Gemini TTS
- **Trạng thái:** chờ gen audio trên Google AI Studio (audio_01 … audio_04)

---

## 1) Điền vào Google AI Studio (Speech) — 4 khối

**Scene** (dán vào ô Scene):
​```
A warm, cinematic documentary about <chủ đề: family, memory, roots, …>.
​```

**Sample Context** (dán vào ô Sample Context):
​```
Clear, warm male documentary narrator, like a quality history or nature documentary.
Articulate and steady, at a normal natural narration pace — professional and composed,
engaging and human, but not sentimental and not slow. Sincere and grounded. NOT
ominous, dramatic or eerie, and never a whisper or a ghost-story tone.
​```

**Speaker / Voice:** đổi Aoede → giọng NAM dẫn phim tài liệu.
Thử: **Iapetus** (trong, rõ) → **Orus** (chắc) → **Rasalgethi/Sadaltager** → **Charon** (trầm ấm).
Tránh **Algenib** (khàn → dễ thành truyện ma). **KHOÁ 1 giọng cho mọi tập.**

**Speech block** — chia 4 phần, mỗi phần mở đầu bằng nhãn `**Phần N · audio_0N**`
(UI reel dựa nhãn này để hiện nút copy riêng từng phần):

**Phần 1 · audio_01** (~50 giây)
> <lời đọc…>

**Phần 2 · audio_02** (~55 giây)
> <lời đọc…>

**Phần 3 · audio_03** (~50 giây)
> <lời đọc…>

**Phần 4 · audio_04** (~35 giây)
> <lời đọc…>

---

## 2) Sau khi gen xong
Lưu `audio_01.wav … audio_04.wav` vào thư mục tập →
`npx tsx reel/scripts/reel-align.ts <slug>`
```

### Cấu trúc file `shot-list.md`
Bảng: `# | Beat (câu dẫn) | Footage cần | Từ khoá tìm (Pexels/Pixabay/Mixkit)`. Một dòng cho mỗi beat của script (10–12 dòng). Quy tắc:
- **Ưu tiên clip dọc 9:16**; clip ngang vẫn dùng được (crop giữa + nền blur) nhưng tránh mặt/người lệch sát mép.
- Từ khoá gồm cả tiếng Anh (footage miễn phí chủ yếu англ). Có yếu tố Việt thì thêm `vietnamese …`.
- Kết bảng bằng mục **Nhạc nền** (piano/đàn dây nhẹ, buồn ấm, không lời — `emotional piano`, `nostalgic strings`) và **Ghi chú** (được tải ít hơn số beat; chỗ nào khó tìm footage thật thì cân nhắc 1 ảnh tư liệu + Ken Burns / AI ảnh cũ).

### File `post.json` (bài đăng fanpage)
```json
{
  "caption": "<tiêu đề/hook>…\n<2–4 câu khơi gợi + 1 câu hỏi mời bình luận>",
  "hashtags": ["donghoviet", "giapha", "giadinh", "nguoncoi", "kyuc"]
}
```
(Có thể để UI tự gen qua nút "AI gen" — reuse `/api/llm/social-caption`.)

## Chuẩn giọng Gemini TTS & bẫy đã biết (BẮT BUỘC nhắc user)
1. **Giọng bị cắt giữa chừng** ← 1 lần gen vượt ~1:30. → chia phần ≤ ~150 từ.
2. **Nghe như truyện ma** ← giọng quá trầm/khàn (Algenib) + Scene tối. → giọng dẫn tài liệu, Scene sáng, ghi rõ "NOT a ghost story".
3. **Đọc quá chậm** ← "unhurried/slow/meditative/intimate/whisper". → "documentary narrator, normal natural pace".
4. **Dừng lâu** ← nhiều "…". → chỉ 1–2 chỗ đắt.
5. Vẫn chậm → lúc assemble tăng tốc ffmpeg `atempo=1.08–1.15` (không đổi cao độ).

## Lệnh pipeline
```bash
npx tsx reel/scripts/reel-align.ts <slug>      # nối audio_NN → loudnorm → whisper → caption.srt + beats.json
npx tsx reel/scripts/reel-assemble.ts <slug>   # footage + nhạc + caption + intro/outro → out/<slug>.mp4
```
- `reel-align.ts`: forced-align-lite neo chữ từ `script.md` (đã bỏ dấu) vào token whisper → caption đúng chính tả, timing thật. Log tỉ lệ neo; <60% cảnh báo.
- `reel-assemble.ts`: footage theo `footage/.order.json` lấp đầy timeline audio (lặp nếu thiếu), cover-crop 1080×1920@30, caption lower-third màu logo (font Be Vietnam Pro), nhạc ducking, intro 3s (TẬP NN · DÒNG HỌ VIỆT + tiêu đề) + outro 3s (app + donghoviet.thaohk.com).

## Checklist trước khi bàn giao tập mới
- [ ] Đã đọc lại `reel/episodes/ong-ba-de-lai/` để khớp giọng/độ dài.
- [ ] `script.md`: 4 khối đủ, 4 phần gắn nhãn `**Phần N · audio_0N**`, ~500–650 từ, hook đúng, CTA gia phả.
- [ ] Không lặp vật thể/câu chốt của tập trước.
- [ ] `shot-list.md`: mỗi beat có footage + từ khoá; có mục Nhạc nền + Ghi chú.
- [ ] `post.json`: caption + 5 hashtag.
- [ ] Nhắc user: (a) khoá đúng giọng nam đã chốt của series, (b) 5 bẫy TTS ở trên, (c) lệnh align/assemble.
```
