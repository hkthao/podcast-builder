# Nếu hôm nay là lần cuối cùng được gặp cha mẹ

- **Tập:** 5
- **Format:** reel 9:16, ~3–3,5 phút, giọng nam dẫn phim tài liệu (rõ, không chậm)
- **Số từ:** ~540 — chia **4 phần** cho Gemini TTS (mỗi part ≤ ~1 phút 30)
- **Trạng thái:** chờ gen audio trên Google AI Studio (audio_01 … audio_04)

---

## 1) Điền vào Google AI Studio (Speech) — theo đúng 3 trường của UI

**Scene** (bối cảnh không gian — dán vào ô Scene):
```
A warm, cinematic documentary about family, parents, and the passing of time.
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
- **GIỮ ĐÚNG giọng nam đã khoá của series** (giọng bạn đã chọn từ Tập 1) — đừng đổi giọng,
  để cả series nhất quán. Nếu cần dò lại: **Iapetus** (trong, rõ) → **Orus** (chắc) →
  **Rasalgethi/Sadaltager** → **Charon** (trầm ấm). **Tránh** Algenib (khàn, dễ thành truyện ma).

**Speech block** — Gemini TTS trên AI Studio mỗi lần gen **tối đa ~1 phút 30 giây**,
nên chia lời đọc thành **4 phần**. Gen TỪNG phần → tải về → lưu đúng thứ tự
`audio_01.wav` … `audio_04.wav` (UI reel tự đánh số nếu upload lần lượt).
`reel-align.ts` sẽ nối 4 part lại theo thứ tự rồi căn caption.

**Phần 1 · audio_01** (~50 giây)

> Nếu hôm nay là lần cuối cùng bạn được gặp cha mẹ, liệu bạn có nhận ra không?
> Sự thật là sẽ chẳng có ai báo trước cho ta điều đó.
>
> Mỗi lần rời quê lên thành phố, tôi có một thói quen. Xe vừa lăn bánh, tôi lại đưa mắt nhìn vào gương chiếu hậu.
> Và lần nào cũng vậy — trong khung gương nhỏ ấy, tôi thấy cha mẹ tôi vẫn đứng ở đầu ngõ. Đứng yên. Vẫy tay. Cho đến khi chiếc xe rẽ qua khúc quanh, hai bóng người mới khuất hẳn.
> Suốt bao năm, tôi coi đó là chuyện hiển nhiên. Về, rồi đi. Rồi lại về.

**Phần 2 · audio_02** (~55 giây)

> Chúng ta luôn nghĩ mình còn rất nhiều thời gian.
> Cho đến một hôm, tôi ngồi tính một phép tính rất đơn giản.
>
> Mỗi năm, tôi về quê chừng bốn, năm lần. Mỗi lần ở lại được đôi ba ngày.
> Nếu cha mẹ tôi còn khoẻ thêm hai mươi năm nữa, thì số lần tôi còn được ngồi ăn cơm cùng ông bà chỉ còn khoảng một trăm lần.
> Cả một đời còn lại của cha mẹ, với tôi, gói gọn trong một con số đếm được trên đầu ngón tay.
> Một trăm lần. Không phải một con số lớn như tôi vẫn tưởng.

**Phần 3 · audio_03** (~50 giây)

> Lần gần nhất về nhà, tôi để ý những điều mà bao năm qua tôi vô tình bỏ lỡ.
> Bàn tay cha đã run hơn khi rót nước. Lưng mẹ đã còng xuống một chút. Bước chân tiễn tôi ra cổng cũng chậm hơn ngày trước.
> Cha mẹ tôi đang già đi, từng ngày, ngay trước mắt tôi. Chỉ là tôi chưa từng chịu nhìn cho thật kỹ.
>
> Lúc tôi lên xe, mẹ vẫn dặn đúng một câu như mọi lần:
> "Đi đường cẩn thận. Về tới nơi, nhắn cho mẹ một tiếng."
> Một câu nói cũ đến mức tôi từng thấy thừa. Giờ tôi mới hiểu — đó là cách mẹ nói rằng mẹ thương tôi, mà chẳng cần dùng đến một chữ thương nào.

**Phần 4 · audio_04** (~35 giây)

> Rồi sẽ đến một ngày, tôi nhìn vào gương chiếu hậu, và đầu ngõ không còn ai đứng đó nữa.
> Tôi không biết ngày ấy là khi nào. Không một ai biết cả.
>
> Cho nên, nếu cha mẹ bạn vẫn còn đang chờ bạn về — xin đừng đợi đến lần sau.
> Hãy về. Ngồi xuống, hỏi cha mẹ về thời trẻ của họ, về ông bà mình, về những câu chuyện chưa ai kịp kể. Và ghi lại, khi còn kịp.
> Bởi có những lần gặp mặt, ta chỉ nhận ra đó là lần cuối… khi nó đã trôi qua mất rồi.

---

## 2) Sau khi gen xong

Tải 4 part về, lưu đúng thứ tự vào thư mục tập (UI reel upload lần lượt sẽ tự đánh số):
`audio_01.wav`, `audio_02.wav`, `audio_03.wav`, `audio_04.wav`

Rồi chạy align (tự nối 4 part → whisper → caption + mốc thời gian thật):
`npx tsx reel/scripts/reel-align.ts lan-cuoi-gap-cha-me`
