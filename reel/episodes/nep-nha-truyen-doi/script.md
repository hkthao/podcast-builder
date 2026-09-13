# Điều giữ một gia đình sống qua trăm năm không nằm trong két sắt

- **Tập:** 3
- **Format:** reel 9:16, ~3–3,5 phút, giọng nam dẫn phim tài liệu (rõ, không chậm)
- **Số từ:** ~570 — chia **4 phần** cho Gemini TTS (mỗi part ≤ ~1 phút 30)
- **Trạng thái:** chờ gen audio trên Google AI Studio (audio_01 … audio_04)

---

## 1) Điền vào Google AI Studio (Speech) — theo đúng 3 trường của UI

**Scene** (bối cảnh không gian — dán vào ô Scene):
```
A warm, cinematic documentary about family, tradition, and the values passed down through generations.
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
- **Đổi Aoede → giọng NAM chất dẫn phim tài liệu.** DÙNG ĐÚNG GIỌNG đã khoá ở Tập 1–2
  để nhất quán series. Thứ tự thử: **Iapetus** (trong, rõ) → **Orus** (chắc) →
  **Rasalgethi/Sadaltager** → **Charon** (trầm ấm, nếu không đọc chậm).
- **Tránh** Algenib (khàn) — dễ thành truyện ma.

**Speech block** — Gemini TTS trên AI Studio mỗi lần gen **tối đa ~1 phút 30 giây**,
nên chia lời đọc thành **4 phần**. Gen TỪNG phần → tải về → lưu đúng thứ tự
`audio_01.wav` … `audio_04.wav` (UI reel tự đánh số nếu upload lần lượt).
`reel-align.ts` sẽ nối 4 part lại theo thứ tự rồi căn caption.

**Phần 1 · audio_01** (~50 giây)

> Điều gì khiến một gia đình tồn tại qua nhiều thế hệ?
> Tôi từng nghĩ câu trả lời là tiền. Cho đến khi tôi nhớ lại những bữa cơm của bà.
>
> Mâm cơm đã dọn ra, khói còn nghi ngút. Lũ trẻ chúng tôi đói meo, nhưng không đứa nào dám cầm đũa.
> Bởi bà có một luật, chưa từng thay đổi: phải đợi cho đủ mặt người trong nhà, rồi đứa nhỏ nhất mới khoanh tay, mời từng người lớn một câu, cả nhà mới bắt đầu ăn.
> Và ở đầu mâm, bao giờ bà cũng để trống một cái bát, một đôi đũa — phần của người chú đi làm ăn xa, mấy năm chưa về.

**Phần 2 · audio_02** (~55 giây)

> Chúng ta thường nghĩ, một gia đình bền vững là nhờ có của ăn của để, nhà cao cửa rộng.
> Nhưng các cụ ngày xưa đã dặn một câu: "Giàu ba họ, khó ba đời."
> Tiền bạc lên rồi lại xuống. Của cải đầy rồi lại vơi.
> Có những dòng họ từng giàu nứt đố đổ vách, mà chỉ ba đời sau, con cháu đã chẳng buồn nhìn mặt nhau.
> Lại có những nhà nghèo rớt mồng tơi, nhưng đời nào cũng có người tử tế, con cháu vẫn quây quần.
>
> Thứ giữ một gia đình đứng vững qua trăm năm không nằm trong két sắt.
> Nó nằm trong cách người ta ngồi vào một bữa cơm. Trong cách người lớn dạy trẻ con biết trên biết dưới, biết ơn, biết nhường.

**Phần 3 · audio_03** (~50 giây)

> Bà tôi ít chữ, cả đời chưa từng giảng một câu đạo lý.
> Bà chỉ nói đúng một điều, mỗi lần có đứa cháu làm gì sai:
> "Nhà mình nghèo tiền, chứ không nghèo cái nết."
> Hồi đó tôi nghe mà chẳng hiểu. Phải rất lâu sau, tôi mới hiểu.
>
> Thứ bà để lại không phải mảnh đất, cũng chẳng phải chỉ vàng. Bà để lại một nếp nhà.
> Và bây giờ, đến lượt con tôi.
> Chẳng ai bắt, mà mỗi bữa cơm, nó vẫn ngồi đợi đủ người, vẫn khoanh tay mời ông bà trước khi cầm đũa.
> Tôi nhìn con, và tôi thấy bà tôi ở trong đó.
> Bà mất đã lâu rồi. Nhưng cái nết bà gieo, vẫn đang lớn lên.

**Phần 4 · audio_04** (~35 giây)

> Có lẽ, thứ khiến một gia đình sống qua nhiều thế hệ không phải là dòng chữ để lại trong di chúc.
> Mà là những giá trị ta sống mỗi ngày — thật đến mức con cháu mang theo mà không cần ai bắt buộc.
>
> Tiền rồi sẽ tiêu hết. Nhưng một nếp nhà tử tế thì truyền mãi.
> Nếp nhà của bạn bắt đầu từ đâu, do ai gây dựng?
> Hãy hỏi ông bà khi còn kịp. Hãy ghi lại những lời dặn, những truyền thống của dòng họ mình.
> Bởi giá trị không tự nó truyền đi — nó chỉ sống, khi vẫn còn có người nhớ để trao lại.

---

## 2) Sau khi gen xong

Tải 4 part về, lưu đúng thứ tự vào thư mục tập (UI reel upload lần lượt sẽ tự đánh số):
`audio_01.wav`, `audio_02.wav`, `audio_03.wav`, `audio_04.wav`

Rồi chạy align (tự nối 4 part → whisper → caption + mốc thời gian thật):
`npx tsx reel/scripts/reel-align.ts nep-nha-truyen-doi`
