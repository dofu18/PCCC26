# Web quiz sự kiện PCCC26 — bảng xếp hạng realtime

## Context
BTC cần một web quiz cho sự kiện PCCC (phòng cháy chữa cháy) tại FPT University. Người tham gia
vào bằng mã số sinh viên + họ tên, tự làm bộ câu hỏi do BTC soạn trước, có bảng xếp hạng cập nhật
liên tục cho màn hình sân khấu, tổng kết + xuất Excel khi hết lượt, và reset để chạy nhóm kế tiếp.
Quy mô nhỏ (10–15 người/lượt) nên ưu tiên **đơn giản, khó sập tại sự kiện** hơn là tối ưu quy mô lớn.
Thư mục `D:\FPT_University\PCCC26` hiện đang trống (greenfield), trừ skill `hallmark` vừa cài.

## Quyết định đã chốt với BTC
| Hạng mục | Chốt |
|---|---|
| Chế độ | Tự do theo tốc độ riêng (không cần MC bấm câu) |
| Hạ tầng | Next.js trên Vercel + Supabase Postgres |
| Mã số | Chỉ validate format `^[A-Z]{2}\d{6}$`; nếu trùng trong session → popup "MSSV này đã tham gia, bạn có chắc muốn dùng MSSV này để tiếp tục?" |
| Dạng câu | 1 đáp án, nhiều đáp án, Đúng/Sai, điền text ngắn |
| Timer | 20s/câu (BTC sửa được, override từng câu); hết giờ → tự sang câu sau, tính sai |
| Thứ tự | Trộn thứ tự câu **và** thứ tự đáp án cho từng người |
| Feedback | Hiện đúng/sai + đáp án ngay sau mỗi câu |
| Điểm | Kiểu Kahoot: càng nhanh càng cao, sai **không** bị trừ |
| Leaderboard | Màn hình chiếu `/display` + người tham gia xem trên điện thoại |
| Reset | Lưu lịch sử session, xuất Excel lại bất kỳ lúc nào; có pop-up confirm |
| Admin | 1 mật khẩu chung (env var) |
| Ảnh câu hỏi | Cột `image` chứa URL ảnh trong Excel |
| UI | Tone trẻ trung, game-show, chủ đề PCCC — **sẽ chỉnh lại theo poster khi BTC có** |

## Công thức điểm (Kahoot-style)
```
Sai / hết giờ  → 0 điểm
Đúng           → round(points * (1 - (time_used / time_limit) / 2))
```
Trả lời tức thì ≈ `points` đầy đủ, trả lời sát giờ ≈ `points/2`. Mặc định `points = 1000`.
Câu nhiều đáp án: **đúng hết mới được điểm** (all-or-nothing) — đơn giản, dễ giải thích cho thí sinh.
Tie-break: tổng thời gian trả lời ít hơn thắng.
Tất cả tham số (`points` mặc định, timer mặc định, bật/tắt speed bonus, all-or-nothing vs điểm từng
phần) nằm trong bảng settings ở admin để BTC đổi mà không cần deploy lại.

## Kiến trúc
- **Next.js 16 App Router + TypeScript**, Tailwind + shadcn/ui.
- **Supabase Postgres** làm DB. Mọi ghi/đọc dữ liệu chấm điểm đi qua **server actions / route handlers**
  dùng `SUPABASE_SERVICE_ROLE_KEY`; client **không** giữ service key, **không** nhận đáp án đúng
  trước khi trả lời. RLS bật, không mở policy nào cho anon → client không truy cập DB trực tiếp.
- **"Realtime" bằng polling 2s** (`useSWR` với `refreshInterval`) trên `/display` và trang kết quả.
  Với 10–15 người, cách này đơn giản và bền hơn websocket; nếu sau cần thật realtime thì đổi sang
  Supabase Realtime chỉ ảnh hưởng 1 hook.
- **Excel** đọc/ghi bằng `exceljs` (chạy server-side, tránh lỗ hổng của `xlsx`).
- Chống gian lận cơ bản: server tự tính `time_used` từ timestamp lúc phát câu → lúc nhận đáp án,
  cap ở `time_limit`; mỗi câu chỉ nhận đáp án 1 lần.

### Database schema (`supabase/migrations/0001_init.sql`)
- `question_sets` — id, name, created_at
- `questions` — id, set_id, order_index, type (`single|multi|boolean|text`), content, image_url,
  options jsonb, correct jsonb, time_limit_s, points, explanation
- `sessions` — id, name, question_set_id, status (`active|finished`), settings jsonb (snapshot lúc mở
  session), started_at, ended_at
- `participants` — id, session_id, code, full_name, display_name (`"MÃ - Họ tên"`), attempt_no,
  question_order jsonb (thứ tự đã trộn, lưu để reload không đổi), started_at, finished_at,
  total_score, total_time_ms
- `answers` — id, participant_id, question_id, given jsonb, is_correct, time_ms, score, served_at, answered_at
- `app_settings` — 1 hàng, các default nêu trên

Mã số trùng: mỗi lần xác nhận tiếp tục tạo một `participants` mới với `attempt_no` tăng dần.
**Leaderboard lấy lượt điểm cao nhất của mỗi mã số** trong session (view `leaderboard`), nên một
người nhập lại không làm loãng bảng xếp hạng.

### Trang & file chính
| Route | Nội dung |
|---|---|
| `app/page.tsx` | Nhập mã số + họ tên, validate format, dialog cảnh báo mã trùng |
| `app/quiz/[participantId]/page.tsx` | Một câu/màn hình, countdown, ảnh, feedback đúng/sai + giải thích |
| `app/result/[participantId]/page.tsx` | Điểm, thứ hạng, top bảng, xem lại từng câu |
| `app/display/page.tsx` | Màn hình chiếu: top 10 chữ lớn, tự cập nhật |
| `app/admin/page.tsx` | Cổng mật khẩu → dashboard |
| `app/admin/questions/*` | CRUD câu hỏi thủ công + upload ảnh URL + import Excel (preview trước khi lưu) |
| `app/admin/session/*` | Mở/đóng session, leaderboard live, **Reset session (pop-up confirm 2 bước)**, xuất Excel |
| `app/admin/history/*` | Danh sách session cũ, xem & xuất lại Excel |
| `app/admin/settings/*` | Timer, điểm, luật chấm, bật/tắt feedback |
| `lib/scoring.ts` | Công thức điểm + chấm từng dạng câu (dùng chung cho mọi route) |
| `lib/excel.ts` | Import/export `exceljs`, dùng chung cho import đề và export bảng xếp hạng |
| `lib/shuffle.ts` | Trộn câu/đáp án, seed theo participant id |
| `lib/supabase/server.ts` | Client service-role, dùng lại ở mọi server action |

### Template Excel import đề
`type | question | image | option_a | option_b | option_c | option_d | correct | time_limit | points | explanation`
- `type`: `single` / `multi` / `boolean` / `text`
- `correct`: `B` (single) · `A,C` (multi) · `TRUE`/`FALSE` (boolean) · chuỗi đáp án (text, so khớp
  bỏ qua hoa/thường, dấu cách thừa, dấu câu)
- `image`: URL công khai (Drive dạng share link sẽ được convert sang direct link nếu nhận ra)
- Admin có nút tải file mẫu `.xlsx` để BTC điền.

### Export bảng xếp hạng
`Hạng | Mã số | Họ tên | Tên hiển thị | Điểm | Số câu đúng | Tổng thời gian | Thời điểm nộp`
Kèm sheet thứ hai: chi tiết từng câu trả lời của từng người (để đối soát/khiếu nại).

### UI — đã chốt qua Hallmark (2026-08-31)
Xem `design/mockup-v1.html` (mở bằng browser) và `design/tokens.css`.
- Macrostructure **Manifesto** · genre playful · nav **N7 Brutal slab** · footer **Ft5 Statement**
- Theme **custom (tuned)**: paper `oklch(95.5% 0.014 60)`, accent đỏ cứu hỏa `oklch(48% 0.20 30)`
- Font: **Anton** (display, đã verify có subset `vietnamese`) + **Be Vietnam Pro** (body)
- Đúng = khối xanh `--color-ok`, sai = khối mực đậm + gạch ngang, luôn kèm icon SVG (không phụ thuộc màu).
  Đỏ giữ riêng cho CTA/timer để không lẫn với nghĩa "sai".
- `line-height` display = **1.12** (cao hơn chuẩn all-caps) vì chữ hoa tiếng Việt có dấu chồng.
- Mọi màu/font đi qua token trong `design/tokens.css` → khi có poster chỉ đổi biến, không sửa component.

_(mục dưới là ghi chú gốc trước khi chạy Hallmark)_
Trước khi viết UI, load skill `hallmark` để thiết kế tone game-show/PCCC (không dùng layout AI
mặc định). Ưu tiên mobile-first: thí sinh dùng điện thoại, `/display` là màn hình duy nhất desktop.
Token màu tập trung ở `app/globals.css` để khi có poster chỉ đổi biến CSS là xong.

## Việc BTC cần cung cấp (chặn deploy, không chặn code)
1. Supabase project → `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
2. `ADMIN_PASSWORD` tự chọn
3. Account Vercel (Vercel CLI hiện chưa cài — sẽ `npm i -g vercel`)
Trong lúc chờ, t chạy được toàn bộ bằng Supabase local hoặc project miễn phí của t để bro xem trước.

## Thứ tự thực hiện
Bước 0 ghi toàn bộ plan này ra `D:\FPT_University\PCCC26\PLAN.md` để BTC theo dõi ngay trong repo;
mỗi bước là một checkbox, t tick `[x]` ngay sau khi làm xong nên bro mở file là biết đang ở đâu.

- [x] 0. Tạo `PLAN.md` ở gốc project (bản kiểm soát tiến độ, nội dung như file này)
- [x] 0.5 Mockup giao diện + design system (`design/mockup-v1.html`, `design/tokens.css`) — chờ BTC duyệt
- [x] 1. Scaffold Next.js 16 + Tailwind 4, cấu trúc thư mục, `.env.example`  
      _(bỏ shadcn: design là khối vuông poster, tự viết component chống lại default bo tròn của shadcn tốn công hơn là viết mới; dialog dùng `<dialog>` native)_
- [x] 2. `supabase/migrations/0001_init.sql` + `supabase/seed.sql` (8 câu PCCC mẫu, đủ 4 dạng câu) — **chờ chạy trên Supabase project của BTC**
- [x] 3. `lib/scoring.ts`, `lib/shuffle.ts`, `lib/excel.ts` + **55 unit test pass**
- [x] 4. Luồng thí sinh: `/` → `/quiz` → `/result` (dialog mã trùng, timer server-side, feedback đúng/sai)
- [x] 5. Leaderboard polling 2s + `/display` cho máy chiếu
- [x] 6. Admin: cổng mật khẩu, bộ đề, import Excel (báo lỗi theo dòng), thêm câu thủ công, settings
- [x] 7. Mở/kết thúc/reset lượt (confirm + bắt tick đã xuất Excel), export Excel 3 sheet, lịch sử
- [x] 8. Thiết kế Hallmark áp vào `app/globals.css`, mobile-first, eslint + build sạch
- [x] 9a. Supabase đã chạy 2 file SQL, kết nối OK, **28 integration test pass trên DB thật**
- [x] 9c. Lớp animation (2026-08-31): CSS motion system trong `globals.css` (vào trang, stagger đáp án,
      nhấc nút có bóng khối, đồng hồ nhịp 5s cuối, slab feedback đóng sập), `CountUp` cho điểm ở
      `/result`, và `motion` (framer-motion) lo leaderboard đổi hạng ở `/display` + `/result`.
      Tôn trọng `prefers-reduced-motion`.
- [ ] 9b. Deploy Vercel (cần account của BTC) + dựng QR cho thí sinh

## Verification — đã chạy 2026-08-31
| Hạng mục | Kết quả |
|---|---|
| `npm test` | 55 unit test pass (chấm điểm, trộn đề, Excel) |
| `npm run test:e2e` | 28 integration test pass trên Supabase thật |
| `npm run build` | pass, typecheck sạch |
| `npx eslint .` | 0 lỗi |
| Đáp án rò xuống client | **không** — payload chỉ có `options` đã trộn, không có `correct`/`explanation` |
| Anon key đọc DB | không đọc được gì (RLS bật, không policy; 2 view revoke anon) |

Chi tiết checklist gốc:
- `npm run test` — scoring & chấm điểm 4 dạng câu, edge case hết giờ / đáp án text sai chính tả nhẹ.
- `npm run dev` rồi tự đóng vai 3 thí sinh ở 3 cửa sổ ẩn danh: kiểm tra mã trùng ra đúng popup,
  thứ tự câu khác nhau giữa các người, timer hết giờ tự sang câu và tính 0 điểm, điểm người nhanh
  hơn cao hơn khi cùng số câu đúng.
- Mở `/display` song song, xác nhận bảng xếp hạng nhảy trong ~2s sau mỗi lần nộp câu.
- Import file Excel mẫu (có URL ảnh, đủ 4 dạng câu) + 1 file lỗi cố ý → phải báo lỗi theo dòng, không
  lưu nửa vời.
- Xuất Excel bảng xếp hạng, mở bằng Excel kiểm tra tiếng Việt và số liệu khớp với `/admin`.
- Reset session: xác nhận popup chặn nhầm, sau reset thí sinh mới vào được, session cũ vẫn xuất lại
  Excel từ `/admin/history`.
- Mở DevTools ở trang quiz: xác nhận payload **không** chứa đáp án đúng của câu chưa trả lời.
