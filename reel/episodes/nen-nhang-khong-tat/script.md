# Vì sao người Việt thờ cúng tổ tiên?

- **Tập:** 6
- **Format:** reel 9:16, ~3–3,5 phút, giọng nam dẫn phim tài liệu (rõ, không chậm)
- **Số từ:** ~540 — chia **4 phần** cho Gemini TTS (mỗi part ≤ ~1 phút 30)
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
- **Dùng ĐÚNG giọng nam đã khoá cho series** (tập 1–5). Đừng đổi giọng giữa series.
  Nếu chưa khoá: **Iapetus** (trong, rõ) → **Orus** (chắc) → **Rasalgethi/Sadaltager**
  → **Charon** (trầm ấm, nếu không đọc chậm).
- **Tránh** Algenib (khàn) — dễ thành truyện ma.

**Speech block** — Gemini TTS trên AI Studio mỗi lần gen **tối đa ~1 phút 30 giây**,
nên chia lời đọc thành **4 phần**. Gen TỪNG phần → tải về → lưu đúng thứ tự
`audio_01.wav` … `audio_04.wav` (UI reel tự đánh số nếu upload lần lượt).
`reel-align.ts` sẽ nối 4 part lại theo thứ tự rồi căn caption.

**Phần 1 · audio_01** (~50 giây)

> Vì sao người Việt thờ cúng tổ tiên?
> Nếu bạn hỏi thẳng câu đó, có lẽ chính ông bà tôi cũng không giải thích trọn vẹn được.
> Nhưng suốt mấy chục năm, chưa một buổi tối nào bàn thờ nhà tôi tắt khói nhang.
>
> Tôi vẫn nhớ cái bát hương bằng sứ đã ngả màu, đặt chính giữa gian nhà.
> Phía sau là tấm ảnh ông bà, ố vàng theo năm tháng.
> Mỗi chiều cuối năm, bà tôi lau bàn thờ thật kỹ, thay chén nước, bày đĩa trái cây.
> Rồi bà đứng đó, thắp ba nén nhang, miệng lẩm nhẩm điều gì đó rất khẽ.
> Hồi nhỏ, tôi không hiểu bà đang nói chuyện với ai.

**Phần 2 · audio_02** (~55 giây)

> Chúng ta hay nghĩ, thờ cúng là chuyện mê tín — là cầu xin tài lộc, xin cho làm ăn phát đạt.
> Nhưng bạn thử nhìn kỹ mà xem.
> Bà tôi chẳng bao giờ xin gì cho riêng mình.
> Bà chỉ kể — kể cho ông nghe đứa cháu nào vừa thi đỗ, nhà ai vừa có tin vui, năm nay mùa màng ra sao.
>
> Tôi dần hiểu ra, nén nhang ấy không phải để cầu xin người đã khuất.
> Mà là một lời nhắn: ông bà ơi, chúng con vẫn nhớ. Chúng con vẫn ở đây.
> Thờ cúng tổ tiên, hoá ra không phải là một tôn giáo.
> Đó là cách một dân tộc dạy nhau hai chữ: biết ơn.

**Phần 3 · audio_03** (~50 giây)

> Ông tôi từng cầm tay tôi, dạy tôi cắm nén nhang cho ngay ngắn.
> Ông nói một câu, hồi đó tôi nghe mà chưa thấm:
> "Con à, chim có tổ, người có tông. Mình từ đâu mà ra, thì phải nhớ đường mà quay về."
>
> Bây giờ, đến lượt tôi đứng trước bàn thờ ấy.
> Con tôi níu áo, hỏi: "Bố ơi, người trong ảnh là ai vậy?"
> Tôi bế con lên, chỉ vào từng khuôn mặt, và kể.
> Kể về ông, về bà, về những người đã sống, đã thương, đã dựng nên cái nhà này.
> Và tôi nhận ra: mỗi nén nhang tôi thắp, là một lần tôi trao cho con biết nó là ai, nó thuộc về đâu.

**Phần 4 · audio_04** (~35 giây)

> Người Việt thờ cúng tổ tiên, không phải vì sợ hãi, cũng chẳng vì mê tín.
> Mà vì chúng ta tin: một người chỉ thật sự ra đi, khi không còn ai nhớ đến họ nữa.
> Nén nhang là sợi dây, giữ cho ký ức ấy không bao giờ tắt.
>
> Nếu ông bà bạn vẫn còn đây, hãy hỏi tên những người trên bàn thờ, hỏi câu chuyện của họ, và ghi lại.
> Bởi có những cái tên, nếu hôm nay ta không kịp lưu giữ,
> thì mai này, sẽ chẳng còn ai nhắc tới nữa.

---

## 2) Sau khi gen xong

Tải 4 part về, lưu đúng thứ tự vào thư mục tập (UI reel upload lần lượt sẽ tự đánh số):
`audio_01.wav`, `audio_02.wav`, `audio_03.wav`, `audio_04.wav`

Rồi chạy align (tự nối 4 part → whisper → caption + mốc thời gian thật):
`npx tsx reel/scripts/reel-align.ts nen-nhang-khong-tat`
