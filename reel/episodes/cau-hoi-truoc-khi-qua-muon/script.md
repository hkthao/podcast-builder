# Những câu hỏi đáng lẽ chúng ta nên hỏi ông bà trước khi quá muộn

- **Tập:** 8
- **Format:** reel 9:16, ~3–3,5 phút, giọng nam dẫn phim tài liệu (rõ, không chậm)
- **Số từ:** ~545 — chia **4 phần** cho Gemini TTS (mỗi part ≤ ~1 phút 30)
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
- **Dùng ĐÚNG giọng nam đã khoá cho series** (tập 1–7). Đừng đổi giọng giữa series.
  Nếu chưa khoá: **Iapetus** (trong, rõ) → **Orus** (chắc) → **Rasalgethi/Sadaltager**
  → **Charon** (trầm ấm, nếu không đọc chậm). **Tránh** Algenib (khàn → dễ thành truyện ma).

**Speech block** — Gemini TTS trên AI Studio mỗi lần gen **tối đa ~1 phút 30 giây**,
nên chia lời đọc thành **4 phần**. Gen TỪNG phần → tải về → lưu đúng thứ tự
`audio_01.wav` … `audio_04.wav` (UI reel tự đánh số nếu upload lần lượt).

**Phần 1 · audio_01** (~50 giây)

> Có những câu hỏi, đáng lẽ chúng ta nên hỏi ông bà — trước khi quá muộn.
> Tôi nhận ra điều đó vào một buổi trưa, khi cả nhà ngồi trước nồi cá kho tôi vừa nấu.
> Mọi người ăn, rồi im lặng. Không ai nói ra, nhưng ai cũng nghĩ chung một điều: không giống bà nấu.
>
> Bà tôi kho cá ngon nức tiếng cả xóm. Cái mùi ấy, ngửi thôi là biết mình đang ở nhà.
> Vậy mà tôi chưa từng một lần hỏi bà: bà cho những gì vào, kho bao lâu, bí quyết nằm ở đâu.
> Tôi cứ nghĩ, mình còn nhiều thời gian lắm.
> Đến khi bà đi rồi, cái công thức ấy đi theo bà — không còn ai trên đời chép lại được nữa.

**Phần 2 · audio_02** (~55 giây)

> Chúng ta thường nghĩ, mình còn cả một đời để hỏi.
> Rằng ông bà sẽ luôn ngồi đó, ở góc nhà quen thuộc, chờ mình về.
> Nhưng thật ra, mỗi ngày trôi qua là thêm một câu hỏi ta vĩnh viễn mất cơ hội để hỏi.
>
> Đâu chỉ là công thức một món ăn.
> Mà là: hồi trẻ ông bà đã gặp và thương nhau thế nào? Điều gì làm ông sợ nhất trong đời?
> Vì sao nhà mình lại rời quê? Cụ tổ của mình tên thật là gì?
> Những câu tưởng vặt vãnh ấy, hoá ra là cả một kho báu — mà ta chỉ thấy quý khi không còn ai để hỏi nữa.

**Phần 3 · audio_03** (~50 giây)

> Tôi vẫn nhớ, hồi còn nhỏ, bà hay bắt đầu bằng câu: "Ngày xưa, bà…"
> Và tôi, đứa cháu vô tâm, thường gạt đi: "Thôi bà kể sau nhé, giờ con bận."
> Cái hẹn "kể sau" ấy, tôi nói bao nhiêu lần, mà chẳng bao giờ có được cái "sau" đó nữa.
>
> Giờ đến lượt tôi làm cha. Mỗi lần con hỏi về gia đình,
> tôi kể hết những gì mình còn nhớ — kể cả những mảnh tôi chỉ nghe loáng thoáng từ bà ngày trước.
> Vì tôi hiểu rồi: ký ức không chờ một ai. Hôm nay ta không hỏi, ngày mai có thể đã là quá muộn.

**Phần 4 · audio_04** (~40 giây)

> Nếu ông bà, cha mẹ bạn vẫn còn ngồi đó hôm nay — xin đừng đợi.
> Hãy pha một ấm trà, ngồi xuống bên cạnh, và hỏi.
> Hỏi tên những người đã khuất. Hỏi câu chuyện thời họ còn trẻ. Hỏi cả công thức món ăn mà bạn thương nhất.
> Và hãy ghi lại — bằng một dòng chữ, một đoạn ghi âm, hay một tấm hình.
>
> Bởi vì con người thì còn có thể đợi.
> Nhưng những câu trả lời thì không.

---

## 2) Sau khi gen xong

Tải 4 part về, lưu đúng thứ tự vào thư mục tập (UI reel upload lần lượt sẽ tự đánh số):
`audio_01.wav`, `audio_02.wav`, `audio_03.wav`, `audio_04.wav`

Rồi chạy align (tự nối 4 part → whisper → caption + mốc thời gian thật):
`npx tsx reel/scripts/reel-align.ts cau-hoi-truoc-khi-qua-muon`
