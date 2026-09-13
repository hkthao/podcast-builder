# ima2-gen trong Docker — gen ảnh cover podcast

Chạy [ima2-gen](https://github.com/lidge-jun/ima2-gen) **cô lập trong container** để
gen ảnh cover 9:16 bằng **GPT OAuth** (đúng engine ảnh của ChatGPT web bạn đang dùng),
nhưng **tự động hoá + không đụng máy host**. Dọn dẹp sau này = xoá 1 thư mục.

Vì gen cover chỉ cần **CLI**, server chạy **loopback trong container** (không mở cổng ra
host, không cần LAN token). Mọi state (config, token, sqlite, ảnh) nằm trong `./data`.

## Yêu cầu
- Docker Desktop (đang chạy).
- 1 tài khoản ChatGPT (bản free là đủ — GPT OAuth chỉ gen ảnh).

## 3 bước

```bash
cd docker/ima2

# 1) Build + chạy server (nền)
docker compose up -d --build

# 2) Đăng nhập GPT 1 lần (device-code: hiện URL + mã, mở trên trình duyệt host)
./login.sh

# 3) Gen cover từ 1 prompt
./gen-cover.sh dieu-gi-con-lai path/to/cover-prompt.txt
#   → ảnh ra: docker/ima2/out/dieu-gi-con-lai.png
```

Prompt lấy từ đâu cũng được — chính cái prompt bạn đang dán vào ChatGPT web. Có thể
pipe thẳng:

```bash
pbpaste | ./gen-cover.sh ten-tap          # từ clipboard (mac)
```

### Lấy prompt tự động từ app podcast (tuỳ chọn)
Nếu studio đang chạy (`npm run studio`, cổng 3000) và đã cấu hình OpenAI key, app tự
sinh prompt cover cho 1 tập. Nối thẳng vào gen:

```bash
curl -s -X POST http://localhost:3000/api/episodes/<slug>/cover-prompt \
  -H 'content-type: application/json' \
  -d '{"provider":"openai","model":"gpt-4o-mini"}' \
| python3 -c 'import sys,json; sys.stdout.write(json.load(sys.stdin)["prompt"])' \
| ./gen-cover.sh <slug>
```

## Tinh chỉnh
```bash
IMA2_QUALITY=high IMA2_SIZE=1024x1536 ./gen-cover.sh ten-tap prompt.txt
IMA2_MODEL=gpt-5.6-terra ./gen-cover.sh ten-tap prompt.txt   # đổi model ảnh GPT
```
- **Size:** GPT image hỗ trợ `1024x1536` (dọc 2:3), `1024x1024`, `1536x1024`, `auto`.
  9:16 chuẩn (1080x1920) không phải size gốc → dùng `1024x1536` làm nền rồi crop trong
  pipeline video, hoặc `auto`.
- `--mode direct` (đã set sẵn): dùng nguyên prompt, không cho server viết lại — đúng vì
  `cover-prompt` của app đã là prompt hoàn chỉnh.

## Vận hành
```bash
docker compose logs -f ima2        # xem log
docker compose exec ima2 ima2 status
docker compose restart ima2        # sau khi login lại
```

## Dọn dẹp (xoá sạch)
```bash
docker compose down                # dừng + xoá container
rm -rf data out                    # xoá token + ảnh + db
docker image rm ima2-gen-local     # xoá image (tuỳ chọn)
```

## Lưu ý / bẫy
- **Chất lượng chữ tiếng Việt:** cùng model với ChatGPT web nên tương đương — nhưng vẫn
  là điểm yếu chung của AI image gen. Gen thử 1 tập, so với bản web trước khi làm hàng loạt.
- **Ổn định:** GPT OAuth ở đây đi qua Codex session (device-auth) không chính thức → có
  thể dính rate-limit hoặc gãy khi OpenAI đổi API. Web chat "chính chủ" bền hơn.
- **`login.sh` báo `codex --device-auth` không hỗ trợ?** Bản codex quá cũ. Chạy
  `docker compose exec ima2 npm ls -g ima2-gen` để xem version; build lại với
  `IMA2_VERSION` mới hơn.
- **Video (Grok):** cần Grok OAuth (`docker compose exec -it ima2 ima2 grok login
  --manual-paste`) và tài khoản xAI — nằm ngoài phạm vi gen cover này.

## Optional: web UI
Muốn dùng giao diện web thay CLI thì phải mở cổng + bật LAN token (server từ chối bind
non-loopback nếu thiếu token). Trong `docker-compose.yml` thêm:
```yaml
    environment:
      IMA2_HOST: 0.0.0.0
      IMA2_LAN_TOKEN: "doi-thanh-chuoi-bi-mat"
    ports:
      - "127.0.0.1:3333:3333"
```
Rồi mở `http://localhost:3333/?token=doi-thanh-chuoi-bi-mat`.
