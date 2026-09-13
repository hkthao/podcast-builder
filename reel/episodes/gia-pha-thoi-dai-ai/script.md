# Một cuốn gia phả có giá trị gì trong thời đại AI?

- **Tập:** 7
- **Format:** reel 9:16, ~3–3,5 phút, giọng nam dẫn phim tài liệu (rõ, không chậm)
- **Số từ:** ~530 — chia **4 phần** cho Gemini TTS (mỗi part ≤ ~1 phút 30)
- **Loại:** video **chuyển đổi** (conversion) — dẫn nhẹ sang app gia phả, KHÔNG quảng cáo lộ
- **Trạng thái:** chờ gen audio trên Google AI Studio (audio_01 … audio_04)

---

## 1) Điền vào Google AI Studio (Speech) — theo đúng 3 trường của UI

**Scene** (bối cảnh không gian — dán vào ô Scene):
```
A warm, cinematic documentary about family, memory, and roots.
```

**Sample Context** (chỉ đạo giọng/cảm xúc — dán vào ô Sample Context):
```
Clear, warm male documentary narrator, like a quality history or nature documentary.
Articulate and steady, at a normal natural narration pace — professional and composed,
engaging and human, but not sentimental and not slow. Sincere and grounded. NOT
ominous, dramatic or eerie, and never a whisper or a ghost-story tone.
```
> ⚠️ Muốn chất phim tài liệu: giữ "documentary narrator, normal natural pace,
> professional". Tránh "slow / unhurried / intimate / whisper" và Scene tối.

**Speaker / Voice** (bấm vào tên speaker để đổi giọng):
- **Dùng ĐÚNG giọng nam đã khoá cho series** (tập 1–6). Đừng đổi giọng giữa series.
  Nếu chưa khoá: **Iapetus** (trong, rõ) → **Orus** (chắc) → **Rasalgethi/Sadaltager**
  → **Charon** (trầm ấm, nếu không đọc chậm). **Tránh** Algenib (khàn → dễ thành truyện ma).

**Speech block** — Gemini TTS trên AI Studio mỗi lần gen **tối đa ~1 phút 30 giây**,
nên chia lời đọc thành **4 phần**. Gen TỪNG phần → tải về → lưu đúng thứ tự
`audio_01.wav` … `audio_04.wav` (UI reel tự đánh số nếu upload lần lượt).

**Phần 1 · audio_01** (~50 giây)

> Một cuốn gia phả có giá trị gì trong thời đại AI?
> Khi mà chỉ cần gõ một câu hỏi, AI trả lời được gần như mọi thứ trên đời.
> Vậy mà tối hôm đó, có một câu tôi gõ vào ô chat — và màn hình chỉ nhấp nháy con trỏ, không một dòng trả lời.
>
> Con gái tôi hỏi: "Bố ơi, cụ tổ nhà mình là ai? Ngày xưa cụ sống thế nào?"
> Tôi quay sang cái máy vẫn biết tuốt mọi thứ.
> Nó biết dân số của mọi quốc gia, biết công thức nấu mọi món ăn.
> Nhưng tên người đã sinh ra dòng máu đang chảy trong con tôi — thì nó chịu.

**Phần 2 · audio_02** (~55 giây)

> Chúng ta thường nghĩ, gia phả chỉ là một danh sách tên khô khan. Vài cái tên, vài ngày sinh, ngày mất.
> Nhưng bạn thử lật một cuốn gia phả thật mà xem.
> Sau mỗi cái tên là một con người đã từng sống, từng yêu, từng vật lộn để nhà mình có được ngày hôm nay.
> Đây là người đã bỏ làng đi mở đất. Kia là người đã nuôi cả đàn em ăn học giữa thời loạn lạc.
>
> Gia phả không phải là một danh sách. Đó là ký ức tập thể của cả một dòng họ.
> AI có thể kể cho bạn nghe lịch sử của cả thế giới.
> Nhưng lịch sử của riêng gia đình bạn — thì không nằm trong bộ nhớ của bất kỳ cỗ máy nào.

**Phần 3 · audio_03** (~50 giây)

> Ông tôi lúc còn sống hay nói một câu, giờ tôi mới thấm:
> "Một cái tên, khi không còn ai nhắc tới nữa, là người ấy mất thêm một lần nữa."
> Hồi đó tôi nghe mà chẳng hiểu.
> Bây giờ, mỗi lần con tôi chỉ vào một tấm ảnh cũ và hỏi "người này là ai", tôi mới thấy ông đã đúng.
>
> Bởi mỗi lần tôi gọi được tên một người, kể được câu chuyện của họ,
> là một lần nữa họ được sống lại — trong trí nhớ của đứa trẻ rồi sẽ còn đi rất xa.
> Đó là điều mà không một dòng dữ liệu nào ngoài kia làm thay tôi được.

**Phần 4 · audio_04** (~40 giây)

> AI có thể nhớ thay cho cả nhân loại.
> Nhưng nó không nhớ giùm bạn: bạn là ai, và bạn đến từ đâu.
> Việc giữ lại gốc gác ấy, chỉ có chính chúng ta mới làm được.
>
> Và may thay, hôm nay việc đó dễ hơn xưa rất nhiều.
> Bạn không cần một cuốn sổ dày hay nét chữ đẹp — chỉ cần bắt đầu ghi lại: một cái tên, một tấm ảnh, một câu chuyện.
> Hãy dựng lại cây gia phả của nhà mình, khi những người biết chuyện vẫn còn ở đây để kể.
> Vì có những cái tên, nếu hôm nay ta không giữ, mai này sẽ chẳng còn ai nhớ nữa.

---

## 2) Sau khi gen xong

Tải 4 part về, lưu đúng thứ tự vào thư mục tập (UI reel upload lần lượt sẽ tự đánh số):
`audio_01.wav`, `audio_02.wav`, `audio_03.wav`, `audio_04.wav`

Rồi chạy align (tự nối 4 part → whisper → caption + mốc thời gian thật):
`npx tsx reel/scripts/reel-align.ts gia-pha-thoi-dai-ai`
