# <TIÊU ĐỀ TẬP>

- **Tập:** <N>   ← số tập, in lên thẻ cover (TẬP NN · DÒNG HỌ VIỆT)
- **Format:** reel 9:16, ~3–4 phút
- **Số từ:** ~<N>
- **Trạng thái:** chờ gen audio

> Tiêu đề (dòng `# ...` trên cùng) sẽ in lên thẻ cover 3 giây đầu để người xem biết chủ đề.

---

## 1) Điền vào Google AI Studio (Speech) — 4 khối, mỗi tập BẮT BUỘC có đủ

> Scene + Sample Context viết RIÊNG cho từng tập, khớp không khí & cảm xúc của tập đó.
> Speaker giữ cố định cả series để giọng nhất quán.

**Scene** (bối cảnh không gian — dán vào ô Scene):
```
A warm, cinematic documentary about <chủ đề tập: gia đình / ký ức / nguồn cội / …>.
```

**Sample Context** (chỉ đạo giọng & cảm xúc — dán vào ô Sample Context):
```
Clear, warm male documentary narrator, like a quality history documentary. Articulate
and steady, at a normal natural narration pace — professional and composed, engaging
and human, but not sentimental and not slow. NOT ominous, dramatic or eerie.
```
> ⚠️ 3 bẫy đã gặp:
> 1. **Nghe như truyện ma** ← giọng quá trầm/khàn + Scene tối. → giọng dẫn phim tài
>    liệu (Iapetus/Orus, tránh Algenib), Scene sáng, ghi rõ "NOT a ghost story".
> 2. **Đọc quá chậm** ← "unhurried/slow/meditative". → "documentary narrator, normal pace".
> 3. **Dừng lâu** ← nhiều dấu "…". → chỉ giữ 1–2 chỗ đắt nhất.
> Vẫn chậm: ffmpeg `atempo=1.08–1.15` lúc ráp (không đổi cao độ).

**Speaker / Voice:**
- Giọng đã khoá cho series: **<TÊN GIỌNG>**  (đổi từ Aoede mặc định).

**Speech block** — Gemini TTS (AI Studio) mỗi lần gen **tối đa ~1 phút 30 giây**
(≈ ≤200 từ). Chia lời đọc thành các **PHẦN** ~120–150 từ, cắt ở ranh giới ý.
Mỗi phần bắt đầu bằng nhãn in đậm `**Phần N · audio_0N**` — UI reel dựa nhãn này
để hiện nút copy riêng từng phần. Gen từng phần → lưu `audio_01.wav … audio_0N.wav`.

**Phần 1 · audio_01** (~<thời lượng>)

> <đoạn 1…>
>
> <đoạn 2…>

**Phần 2 · audio_02** (~<thời lượng>)

> <đoạn 3…>

---

## 2) Sau khi gen xong
Lưu `audio_01.wav … audio_0N.wav` vào thư mục tập (UI upload lần lượt tự đánh số)
→ `npx tsx reel/scripts/reel-align.ts <slug>` (tự nối các part rồi căn caption).
