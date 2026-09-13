# Điều cuối cùng ông bà để lại không phải là tài sản

- **Tập:** 1
- **Format:** reel 9:16, ~3–3,5 phút, giọng nam dẫn phim tài liệu (rõ, không chậm)
- **Số từ:** ~560 — chia **4 phần** cho Gemini TTS (mỗi part ≤ ~1 phút 30)
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
- **Đổi Aoede → giọng NAM chất dẫn phim tài liệu** (rõ, chắc, chuyên nghiệp).
  Thử theo thứ tự: **Iapetus** (trong, rõ) → **Orus** (chắc) → **Rasalgethi/Sadaltager**
  (chất "người kể có hiểu biết") → **Charon** (trầm ấm, nếu không đọc chậm).
- **Tránh** Algenib (khàn) — dễ thành truyện ma.
- **KHOÁ 1 giọng cho mọi tập sau** để nhất quán series.

**Speech block** — Gemini TTS trên AI Studio mỗi lần gen **tối đa ~1 phút 30 giây**,
nên chia lời đọc thành **4 phần**. Gen TỪNG phần → tải về → lưu đúng thứ tự
`audio_01.wav` … `audio_04.wav` (UI reel tự đánh số nếu upload lần lượt).
`reel-align.ts` sẽ nối 4 part lại theo thứ tự rồi căn caption.

**Phần 1 · audio_01** (~50 giây)

> Ông tôi mất đi, không để lại một chỉ vàng nào.
> Nhưng thứ ông để lại khiến cả dòng họ ngồi lặng đi suốt một buổi chiều.
>
> Đó là một cuốn sổ. Bìa da đã sờn, gáy bong ra từng mảng.
> Bên trong, nét chữ run run của ông chép lại tên từng người trong họ — từ đời cụ, đời kỵ, cho tới đứa cháu mới sinh năm ngoái.
> Ngày giỗ. Ngày cưới. Ai lấy ai. Ai đi xa xứ rồi không về.
> Có những cái tên bị gạch đi, bên cạnh ghi vỏn vẹn một chữ: "mất".
> Và có những cái tên, ông để trống ngày sinh — vì chính ông cũng không còn ai để hỏi.

**Phần 2 · audio_02** (~55 giây)

> Chúng ta thường nghĩ, thứ ông bà để lại là nhà, là đất, là chút của cải phòng thân.
> Nhưng bạn thử nghĩ mà xem.
> Nhà rồi cũng bán. Đất rồi cũng chia. Tiền rồi cũng hết.
> Chỉ có một thứ, một khi mất đi thì không bao giờ mua lại được: đó là ký ức về việc mình từ đâu tới.
>
> Tôi vẫn nhớ những buổi chiều ngồi cạnh ông bên hiên nhà.
> Ông kể về người cụ tôi chưa từng gặp — người đã gánh cả gia đình vượt qua nạn đói, đi bộ mấy trăm cây số về quê, chỉ để được chết trên mảnh đất của tổ tiên.
> Hồi ấy tôi còn nhỏ, chỉ nghe cho vui.
> Tôi đâu biết, mỗi câu chuyện ông kể là một lần ông trao lại cho tôi một phần của chính mình.

**Phần 3 · audio_03** (~50 giây)

> Ông tôi hay nói một câu, hồi đó tôi nghe mà chẳng để tâm:
> "Cây có cội, nước có nguồn. Người không biết gốc của mình, thì đi đâu cũng thấy lạc."
> Phải đến khi ông không còn, tôi mới hiểu.
>
> Bây giờ, mỗi lần con tôi hỏi: "Cụ của con tên gì hả bố?"
> Tôi mở cuốn sổ ấy ra.
> Và tôi nhận ra, ông chưa từng rời đi.
> Ông vẫn ở đó — trong từng cái tên, từng ngày tháng, từng nét mực đã phai.
>
> Ông không để lại tài sản.
> Ông để lại một sợi dây — nối tôi với những người tôi chưa từng gặp mặt, nhưng vẫn đang chảy trong máu tôi.

**Phần 4 · audio_04** (~35 giây)

> Có thể, món quà lớn nhất mà một đời người để lại không phải là thứ ta cầm được trên tay.
> Mà là câu trả lời cho một câu hỏi: "Tôi là ai, và tôi thuộc về đâu."
>
> Nếu ông bà bạn vẫn còn đây hôm nay, hãy hỏi. Hãy ghi lại. Hỏi tên những người đã khuất, hỏi những câu chuyện chưa ai kể.
> Bởi vì có những cánh cửa, một khi đã đóng lại…
> sẽ không bao giờ mở ra được nữa.

---

## 2) Sau khi gen xong

Tải 4 part về, lưu đúng thứ tự vào thư mục tập (UI reel upload lần lượt sẽ tự đánh số):
`audio_01.wav`, `audio_02.wav`, `audio_03.wav`, `audio_04.wav`

Rồi chạy align (tự nối 4 part → whisper → caption + mốc thời gian thật):
`npx tsx reel/scripts/reel-align.ts ong-ba-de-lai`
