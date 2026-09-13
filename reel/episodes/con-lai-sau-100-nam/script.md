# Điều gì thực sự còn lại sau khi một người qua đời?

- **Tập:** 2
- **Format:** reel 9:16, ~3–3,5 phút, giọng nam dẫn phim tài liệu (rõ, không chậm)
- **Số từ:** ~540 — chia **4 phần** cho Gemini TTS (mỗi part ≤ ~1 phút 30)
- **Trạng thái:** chờ gen audio trên Google AI Studio (audio_01 … audio_04)

---

## 1) Điền vào Google AI Studio (Speech) — theo đúng 3 trường của UI

**Scene** (bối cảnh không gian — dán vào ô Scene):
```
A warm, cinematic documentary about family, memory, and the people we leave behind.
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
- **Đổi Aoede → giọng NAM chất dẫn phim tài liệu.** DÙNG ĐÚNG GIỌNG đã khoá ở Tập 1
  để nhất quán series. Thứ tự thử: **Iapetus** (trong, rõ) → **Orus** (chắc) →
  **Rasalgethi/Sadaltager** → **Charon** (trầm ấm, nếu không đọc chậm).
- **Tránh** Algenib (khàn) — dễ thành truyện ma.

**Speech block** — Gemini TTS trên AI Studio mỗi lần gen **tối đa ~1 phút 30 giây**,
nên chia lời đọc thành **4 phần**. Gen TỪNG phần → tải về → lưu đúng thứ tự
`audio_01.wav` … `audio_04.wav` (UI reel tự đánh số nếu upload lần lượt).
`reel-align.ts` sẽ nối 4 part lại theo thứ tự rồi căn caption.

**Phần 1 · audio_01** (~50 giây)

> Sau 100 năm, điều gì còn lại từ cuộc đời của bạn?
> Không phải ngôi nhà. Không phải số tiền trong tài khoản. Mà có lẽ chỉ là một tấm ảnh — nằm im trong một cuốn album cũ, ở một ngăn tủ nào đó.
>
> Nhà tôi có một tấm ảnh như thế. Một người đàn ông mặc áo the, đứng nghiêm trang, ánh mắt nhìn thẳng vào ống kính. Tấm ảnh đã ố vàng, mép cong lên vì thời gian.
> Nhưng không ai trong nhà còn biết ông là ai.
> Bố tôi lắc đầu. Bác cả cũng lắc đầu. Chỉ biết đó là "người bên nội, đời trước".
> Một con người từng sống trọn một kiếp — yêu, giận, lo toan, hy vọng — giờ chỉ còn lại một khuôn mặt không tên.

**Phần 2 · audio_02** (~55 giây)

> Người ta hay nói, chết là hết. Nhưng thật ra, mỗi người chết đến hai lần.
> Lần thứ nhất, là khi trái tim ngừng đập.
> Lần thứ hai, là khi cái tên của họ được nhắc đến lần cuối cùng — rồi thôi, không bao giờ vang lên nữa.
>
> Lần chết thứ nhất, ta không tránh được. Nhưng lần chết thứ hai thì có.
> Tôi từng nghĩ, thứ còn lại sau một đời người là nấm mồ ngoài nghĩa trang, là dòng chữ khắc trên bia đá.
> Nhưng bia đá rồi cũng mòn. Cỏ rồi cũng phủ. Có những ngôi mộ, con cháu còn chẳng nhớ đường ra thăm.
> Thứ duy nhất thật sự ở lại, là khi ai đó còn kể về ta. Còn gọi tên ta. Còn nhớ ta từng cười ra sao.

**Phần 3 · audio_03** (~50 giây)

> Bà tôi, lúc còn sống, hay ngồi lật cuốn album cũ và gọi tên từng người trong ảnh.
> "Đây là cụ con, đây là ông trẻ, đây là dì Ba mất sớm…"
> Hồi ấy tôi nghĩ bà chỉ đang hoài niệm. Giờ tôi mới hiểu — bà đang làm một việc thiêng liêng: bà đang giữ cho họ khỏi lần chết thứ hai.
>
> Bây giờ, mỗi tối, tôi lại mở cuốn album ấy ra cùng các con.
> Tôi chỉ vào từng khuôn mặt và kể: người này là ai, sống thế nào, thương ta ra sao.
> Bọn trẻ nghe, rồi hỏi lại, rồi nhớ.
> Và tôi biết, chừng nào bọn trẻ còn gọi được tên những người trong tấm ảnh ấy — thì những con người đó vẫn chưa thật sự rời đi.

**Phần 4 · audio_04** (~35 giây)

> Vậy nên, điều thật sự còn lại sau khi một người qua đời, không phải là những gì họ có.
> Mà là những gì họ được nhớ.
>
> Đừng để nhà mình có thêm một tấm ảnh không tên.
> Khi ông bà, cha mẹ vẫn còn đây — hãy ngồi xuống, hỏi, và ghi lại. Tên họ, câu chuyện của họ, giọng nói của họ.
> Bởi một ngày nào đó, chính bạn cũng sẽ chỉ còn là một khuôn mặt trong tấm ảnh.
> Và điều duy nhất bạn mong, là vẫn có ai đó gọi được tên mình.

---

## 2) Sau khi gen xong

Tải 4 part về, lưu đúng thứ tự vào thư mục tập (UI reel upload lần lượt sẽ tự đánh số):
`audio_01.wav`, `audio_02.wav`, `audio_03.wav`, `audio_04.wav`

Rồi chạy align (tự nối 4 part → whisper → caption + mốc thời gian thật):
`npx tsx reel/scripts/reel-align.ts con-lai-sau-100-nam`
