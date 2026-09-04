# PCCC26 — web đố vui phòng cháy chữa cháy

Thí sinh vào bằng mã số sinh viên, trả lời bộ câu hỏi do ban tổ chức soạn, bảng xếp hạng cập nhật
liên tục cho màn hình sân khấu. Hết lượt thì xuất Excel và reset để chạy nhóm kế tiếp.

## Chạy lần đầu

### 1. Tạo Supabase project

1. Vào [supabase.com](https://supabase.com) → **New project** (gói miễn phí là đủ cho 10–15 người/lượt).
2. Mở **SQL Editor** → dán toàn bộ `supabase/migrations/0001_init.sql` → **Run**.
3. Dán tiếp `supabase/migrations/0002_questions_per_attempt.sql` → **Run**.
4. Muốn có sẵn 8 câu mẫu để thử: dán tiếp `supabase/seed.sql` → **Run**.
5. Lấy hai giá trị:
   - **Project URL**: Settings → Data API → *Project URL*
   - **service_role key**: Settings → API Keys → *service_role* (khoá bí mật, có toàn quyền)

### 2. Cấu hình môi trường

```bash
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # dùng làm APP_SECRET
```

Điền `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `APP_SECRET` vào `.env.local`.

### 3. Chạy

```bash
npm install
npm run dev
```

Mở http://localhost:3000.

## Các trang

| Đường dẫn | Ai dùng | Việc gì |
| --- | --- | --- |
| `/` | thí sinh | Nhập mã số + họ tên để vào lượt đang mở |
| `/quiz` | thí sinh | Trả lời từng câu, có đồng hồ, hiện đúng/sai ngay |
| `/result` | thí sinh | Điểm, thứ hạng, xem lại bài làm |
| `/display` | máy chiếu | Bảng xếp hạng chữ lớn, tự cập nhật |
| `/admin` | ban tổ chức | Mở/kết thúc/reset lượt, bảng xếp hạng, xuất Excel |
| `/admin/session/[id]` | ban tổ chức | Bài làm chi tiết: từng thí sinh, từng câu, đáp án đã chọn, điểm |
| `/admin/questions` | ban tổ chức | Bộ đề: nhập Excel hoặc thêm tay |
| `/admin/history` | ban tổ chức | Các lượt đã kết thúc, xuất lại Excel |
| `/admin/settings` | ban tổ chức | Thời gian, điểm, luật chấm, số câu mỗi lượt |

## Cách chạy một buổi sự kiện

1. `/admin/questions` → tạo bộ đề → tải file mẫu → điền câu hỏi → nhập lại.
2. `/admin/settings` → chỉnh thời gian mỗi câu, điểm, và **số câu mỗi lượt** nếu cần.
   Để trống số câu thì thí sinh làm hết bộ đề; điền 10 thì mỗi người được rút ngẫu nhiên 10 câu
   từ ngân hàng (mỗi người một tập câu khác nhau, reload không đổi đề).
3. `/admin` → **Mở lượt thi**.
4. Mở `/display` trên laptop nối máy chiếu.
5. Thí sinh vào `/` (dán link hoặc dựng QR trỏ tới địa chỉ web).
6. Muốn soi kỹ ai trả lời gì → `/admin` → **Xem bài làm chi tiết** (lượt cũ xem ở `/admin/history`).
7. Xong lượt → `/admin` → **Xuất Excel** → **Reset session** (phải tick đã xuất Excel mới bấm được).

## Cách tính điểm

```
sai hoặc hết giờ → 0 điểm (không bị trừ)
đúng             → round(points × (1 − (thời_gian_dùng / giới_hạn) / 2))
```

Bấm gần như tức thì được trọn `points` (mặc định 1000), trả lời sát hết giờ còn khoảng một nửa.
Đồng điểm thì ai tổng thời gian ít hơn xếp trên. Mỗi mã số chỉ tính lượt làm có điểm cao nhất.

Đổi tham số ở `/admin/settings`. Mỗi lượt thi lưu lại cấu hình tại thời điểm mở lượt, nên sửa
cấu hình giữa sự kiện không làm lệch điểm của lượt đang chạy.

## File Excel câu hỏi

Cột: `type · question · image · option_a…d · correct · time_limit · points · explanation`

- `type`: `single` (1 đáp án) · `multi` (nhiều đáp án) · `boolean` (Đúng/Sai) · `text` (điền chữ)
- `correct`: `B` · `A,C` · `TRUE`/`FALSE` · đáp án chữ (nhiều biến thể cách nhau bằng `|`)
- `image`: URL ảnh công khai. Link Google Drive dạng chia sẻ được tự chuyển sang link xem trực tiếp.
- Thêm cột `option_e`, `option_f`… nếu cần nhiều hơn 4 đáp án.

File có dòng lỗi thì **không lưu gì cả** và báo lỗi theo từng số dòng — sửa file rồi nhập lại.
Tải file mẫu (kèm sheet hướng dẫn) tại `/admin/template`.

## Bảo mật

- RLS bật trên mọi bảng và không có policy nào, nên anon key không đọc được gì. Toàn bộ truy cập
  đi qua server bằng service-role key.
- Đáp án đúng không bao giờ có trong payload gửi xuống client trước khi thí sinh trả lời.
- Thời gian trả lời do server tính từ lúc phát câu, không tin đồng hồ máy thí sinh. Reload trang
  không làm đồng hồ chạy lại.
- Cookie định danh thí sinh và phiên quản trị đều được ký HMAC bằng `APP_SECRET`.
- Mỗi câu chỉ nhận đáp án một lần (unique index trong DB), gửi lại không ghi đè điểm.

## Lệnh

```bash
npm run dev         # chạy local
npm run build       # build production (đã bao gồm typecheck)
npm test            # 55 unit test: chấm điểm, trộn đề, đọc/ghi Excel
npm run typecheck   # chỉ typecheck
npm run lint        # eslint
```

## Deploy lên Vercel

```bash
npm i -g vercel
vercel link
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add ADMIN_PASSWORD
vercel env add APP_SECRET
vercel deploy --prod
```

## Thiết kế

Design system nằm ở `app/globals.css` (token) — dựng bằng skill `hallmark`, macrostructure
Manifesto, accent đỏ cứu hỏa, font Anton + Be Vietnam Pro (cả hai đều có subset tiếng Việt).
Khi có poster của sự kiện, đổi các biến `--color-*` ở đầu file là khớp tone, không cần sửa component.
Bản mockup gốc để đối chiếu: `design/mockup-v1.html`.
