# Pexels API — tham chiếu nhanh (cho footage b-roll)

Nguồn: https://www.pexels.com/api/documentation/ · Client: `podcast/scripts/pexels.ts` · Key: `PEXELS_API_KEY` trong `.env`.

## Auth
Header: `Authorization: <PEXELS_API_KEY>` (không có "Bearer").

## Rate limit
- Mặc định **200 req/giờ**, **20.000 req/tháng**.
- Header trả về (chỉ trên 2xx): `X-Ratelimit-Limit`, `X-Ratelimit-Remaining`, `X-Ratelimit-Reset` (UNIX ts).
- → footage-plan tải ~35-50 clip/tập (mỗi clip 1 search + 1 people-check ảnh KHÔNG tính vào Pexels) → an toàn trong giới hạn. Nếu chạy nhiều tập liên tục, để ý `X-Ratelimit-Remaining`.

## Base URL
`https://api.pexels.com/v1`

## Video endpoints
| Endpoint | Method | Ghi chú |
|---|---|---|
| `/videos/search` | GET | tìm theo query |
| `/videos/popular` | GET | video phổ biến (lọc theo kích thước/thời lượng) |
| `/videos/videos/:id` | GET | 1 video theo id |

### `/videos/search` params
- `query` (bắt buộc): vd `ocean waves`, `lotus flower`
- `orientation`: `landscape` | `portrait` | `square` — ta dùng **portrait** (9:16)
- `size`: `large` (4K) | `medium` (Full HD) | `small` (HD)
- `locale`: `en-US`, `vi-VN` không có; dùng `en-US`
- `page` (default 1), `per_page` (default 15, **max 80**)

### `/videos/popular` params
- `min_width`, `min_height` (px)
- `min_duration`, `max_duration` (giây)
- `page`, `per_page` (max 80)

## Video object (rút gọn)
```
{ id, width, height, url, image, duration,
  user: { id, name, url },
  video_files: [ { id, quality: "hd"|"sd"|"uhd", file_type: "video/mp4",
                   width, height, fps, link } ],
  video_pictures: [ { id, picture, nr } ] }
```
- Chọn file: lọc `video_files` dọc (`height>width`), ưu tiên `height>=1080` nhỏ nhất (đủ nét, nhẹ).

## Photo endpoints (nếu cần ảnh)
- `/search` (query, orientation, size `large`(24MP)/`medium`(12MP)/`small`(4MP), **`color`**: red/orange/yellow/green/turquoise/blue/violet/pink/brown/black/gray/white hoặc hex), `/curated`, `/photos/:id`.
- Photo object có `avg_color` (hex màu trung bình) + `src.{original,large2x,large,medium,portrait,landscape,tiny}`.
- 💡 `color` param + `avg_color` hữu ích nếu sau này muốn chọn ảnh/clip theo **màu chủ đề** của tập.

## Collections
- `/collections/featured`, `/collections` (của mình), `/collections/:id` (params `type=photos|videos`, `sort=asc|desc`).

## Attribution (BẮT BUỘC)
- Hiện link nổi bật tới Pexels + ghi công tác giả: "Footage: <tên> (Pexels)".
- footage-plan tự gom `pexelsAttributions` → set `episode.footageCredit`; PublishTab nối vào khối công bố.
- KHÔNG sao chép core-functionality của Pexels; không lạm dụng API.

## Mở rộng client
`searchPexelsVideos(query, { orientation, size, perPage, page, minHeight, minDurationS, maxDurationS })` +
`getPopularPexelsVideos({ minWidth, minHeight, minDurationS, maxDurationS, perPage, page })` +
`downloadPexelsVideo(url, dest)`. Rate-limit header log qua `onRateLimit`.
