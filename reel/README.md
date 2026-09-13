# reel/ — Pipeline video reel ngắn (gia đình · gia phả · văn hoá)

**Cô lập hoàn toàn với Podcast Studio.** Studio chạy qua `server/index.ts`; thư mục này
không được server import nên **không trigger reload, không ảnh hưởng studio**. Reel chỉ
_đọc lại_ (import read-only) `shared/transcribe` + `shared/audio` — không sửa gì của studio.
tmp/output/footage của reel nằm gọn trong `reel/`, tách khỏi `tmp/` `output/` của studio.

## Định dạng
Reel 9:16 dọc, ~4–5 phút, ≤700 từ. Audio kể chuyện (Google AI Studio, KHÔNG dùng API tốn tiền)
+ footage miễn phí (Pexels/Pixabay/Mixkit/Videvo) + caption cháy chữ + nhạc nền. Ráp bằng ffmpeg.

## Nguyên tắc cốt lõi
**Audio là master timeline.** Không cắt audio cho khớp footage — ép footage vào khung audio.
Mốc thời gian lấy từ whisper (timestamp thật), không đoán bằng số chữ.

**Mỗi `script.md` BẮT BUỘC có đủ 4 khối để paste thẳng vào Gemini TTS:**
Scene · Sample Context · Speaker · Speech block — trong đó Scene + Sample Context
viết riêng theo cảm xúc từng tập (xem `episodes/_TEMPLATE.md`). Speaker giữ cố định cả series.

## Quy trình 1 tập

```
1. Claude  → reel/episodes/<slug>/script.md   (script ≤700 từ + prompt TTS)
             reel/episodes/<slug>/shot-list.md (footage cần + từ khoá)

2. Bạn     → dán prompt TTS vào Google AI Studio (web) → tải audio về
             lưu: reel/episodes/<slug>/audio.wav

3. Align   → npx tsx reel/scripts/reel-align.ts <slug>
             sinh: work/caption.srt + work/beats.json  (mốc thời gian THẬT)

4. Bạn     → tải footage theo shot-list, đổi tên 01_*.mp4, 02_*… 
             bỏ vào: reel/episodes/<slug>/footage/
             (nhạc nền: reel/assets/music/)

5. Ráp     → npx tsx reel/scripts/reel-assemble.ts <slug>
             xuất: out/<slug>.mp4  (9:16, caption, nhạc, grain)
```

Footage dài/ngắn/thiếu/thừa đều được — bước 5 tự cắt/kéo/tái dùng cho khớp audio.

## Cấu trúc
```
reel/
  scripts/          reel-align.ts, reel-assemble.ts   (chưa build — chờ duyệt tập mẫu)
  assets/music/     nhạc nền dùng chung
  episodes/<slug>/
    script.md       prompt TTS + text
    shot-list.md    footage cần tải
    audio.wav       (bạn bỏ vào sau khi gen)
    footage/        01_*.mp4 …  (bạn bỏ vào)
    work/           caption.srt, beats.json  (align sinh ra)
    out/            <slug>.mp4  (kết quả)
```
