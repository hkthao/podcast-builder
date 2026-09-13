# Tại sao càng lớn tuổi, con người càng nhớ về quê hương?

- **Tập:** 4
- **Format:** reel 9:16, ~3–3,5 phút, giọng nam dẫn phim tài liệu (rõ, không chậm)
- **Số từ:** ~540 — chia **4 phần** cho Gemini TTS (mỗi part ≤ ~1 phút 30)
- **Trạng thái:** chờ gen audio trên Google AI Studio (audio_01 … audio_04)

---

## 1) Điền vào Google AI Studio (Speech) — theo đúng 3 trường của UI

**Scene** (bối cảnh không gian — dán vào ô Scene):
```
A warm, cinematic documentary about homeland, memory, and growing old.
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
- **Đổi Aoede → giọng NAM chất dẫn phim tài liệu.** DÙNG ĐÚNG GIỌNG đã khoá ở Tập 1–3
  để nhất quán series. Thứ tự thử: **Iapetus** (trong, rõ) → **Orus** (chắc) →
  **Rasalgethi/Sadaltager** → **Charon** (trầm ấm, nếu không đọc chậm).
- **Tránh** Algenib (khàn) — dễ thành truyện ma.

**Speech block** — Gemini TTS trên AI Studio mỗi lần gen **tối đa ~1 phút 30 giây**,
nên chia lời đọc thành **4 phần**. Gen TỪNG phần → tải về → lưu đúng thứ tự
`audio_01.wav` … `audio_04.wav` (UI reel tự đánh số nếu upload lần lượt).
`reel-align.ts` sẽ nối 4 part lại theo thứ tự rồi căn caption.

**Phần 1 · audio_01** (~50 giây)

> Bố tôi năm nay ngoài tám mươi. Ông quên cả tên loại thuốc vừa uống sáng nay.
> Nhưng con đường làng của bảy mươi năm trước, thì ông nhớ không sót một khúc.
>
> Mấy năm nay ông sống cùng con cháu giữa thành phố, đủ đầy chẳng thiếu thứ gì. Vậy mà chiều nào ông cũng ra ban công, nhìn về một phương trời xa.
> Rồi ông hỏi, câu hỏi lặp đi lặp lại: "Bao giờ thì cho bố về quê?"
> Ông tả được cả cái giếng đầu ngõ, cây đa cổng làng, mùi rơm rạ sau mùa gặt. Tả rõ đến mức tôi ngỡ như ông vừa ở đó ngày hôm qua.
> Còn tôi thì cứ tự hỏi: vì sao càng về già, người ta lại càng ngoảnh đầu về nơi mình sinh ra?

**Phần 2 · audio_02** (~55 giây)

> Các nhà tâm lý học có hẳn một cái tên cho điều này. Họ gọi đó là "hiệu ứng hồi tưởng".
> Khi ta già đi, những chuyện mới xảy ra thì trôi tuột đi rất nhanh. Nhưng ký ức của quãng đời mười lăm, hai mươi tuổi lại hiện về rõ nét đến lạ — như thể được khắc sâu hơn tất thảy.
> Đó là lý do vì sao ông bà ta, đến cuối đời, cứ kể mãi về thời trẻ. Về cái làng, con sông, những người bạn thuở thiếu thời.
>
> Nhưng tôi tin, còn một điều sâu hơn cả khoa học.
> Chúng ta thường nghĩ, nhớ quê là nhớ một nơi chốn — một toạ độ trên bản đồ.
> Nhưng thật ra, ta đâu nhớ cái nơi ấy. Ta nhớ phiên bản của chính mình khi còn ở đó. Nhớ một thời ta còn cha còn mẹ, còn trẻ, còn được vô lo.

**Phần 3 · audio_03** (~50 giây)

> Năm ngoái, tôi thu xếp đưa bố về quê một chuyến.
> Con đường ông tả đã đổ bê tông. Cái giếng đã lấp từ lâu. Cây đa đầu làng cũng chẳng còn.
> Tôi sợ ông buồn. Nhưng ông chỉ đứng lặng giữa mảnh đất cũ, hít một hơi thật sâu, rồi nói khẽ:
> "Về đến đây rồi, bố thấy nhẹ cả người."
>
> Lúc ấy tôi mới hiểu. Ông về, không phải để tìm lại cái giếng hay cây đa.
> Ông về để được đứng lại đúng nơi cuộc đời mình bắt đầu. Để thấy mình vẫn còn thuộc về một nơi nào đó trên cõi đời này.
> Ông tôi hay nói một câu, giờ tôi mới thấm: "Lá rụng thì phải về cội."

**Phần 4 · audio_04** (~35 giây)

> Có lẽ, nỗi nhớ quê khi về già không phải là sự yếu lòng của tuổi tác.
> Mà là cách trái tim ta tự tìm đường về nguồn cội — về nơi đã làm nên con người mình.
>
> Nếu cha mẹ bạn vẫn còn đây, xin đừng đợi. Hãy hỏi ông bà về cái làng thời thơ ấu, về những con người, những câu chuyện của một thời đã xa.
> Hãy ghi lại. Và hãy đưa ông bà về thăm quê, khi đôi chân còn đi được.
> Bởi có những chuyến trở về, một khi đã lỡ…
> thì cả đời sẽ không còn cơ hội để đi.

---

## 2) Sau khi gen xong

Tải 4 part về, lưu đúng thứ tự vào thư mục tập (UI reel upload lần lượt sẽ tự đánh số):
`audio_01.wav`, `audio_02.wav`, `audio_03.wav`, `audio_04.wav`

Rồi chạy align (tự nối 4 part → whisper → caption + mốc thời gian thật):
`npx tsx reel/scripts/reel-align.ts cang-gia-cang-nho-que`
