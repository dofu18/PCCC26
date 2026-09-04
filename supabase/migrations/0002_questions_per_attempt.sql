-- PCCC26 · rút ngẫu nhiên N câu từ ngân hàng cho mỗi lượt làm bài
-- Chạy file này trong Supabase → SQL Editor sau 0001_init.sql.
--
-- 0 = lấy hết bộ đề (hành vi cũ, nên đây cũng là mặc định để dữ liệu sẵn có không đổi).

alter table app_settings
  add column if not exists questions_per_attempt int not null default 0
    check (questions_per_attempt between 0 and 1000);
  