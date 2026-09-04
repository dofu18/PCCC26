-- PCCC26 · bỏ điểm, bỏ giới hạn thời gian mỗi câu
-- Chạy trong Supabase → SQL Editor sau 0002_questions_per_attempt.sql.
--
-- Luật mới: xếp hạng theo SỐ CÂU ĐÚNG (giảm dần), đồng hạng thì TỔNG THỜI GIAN ít hơn xếp trên.
-- Tổng thời gian = tổng thời gian suy nghĩ của từng câu (từ lúc câu hiện ra tới lúc bấm trả lời).
-- KHÔNG tính thời gian đọc màn đúng/sai + giải thích giữa các câu, nên ai đọc kỹ giải thích
-- để học không bị phạt.
--
-- ⚠ KHÔNG ĐẢO NGƯỢC ĐƯỢC: xoá hẳn cột điểm và dữ liệu điểm của các lượt cũ.

-- Phải drop view TRƯỚC khi bỏ cột: participant_scores có sum(a.score) nên Postgres sẽ
-- từ chối "drop column score" khi view còn tồn tại. leaderboard phụ thuộc
-- participant_scores nên drop leaderboard trước.
drop view if exists leaderboard;
drop view if exists participant_scores;

-- answers.score là NOT NULL nên buộc phải bỏ, không thể chỉ ngừng ghi.
alter table answers      drop column if exists score;
alter table questions    drop column if exists time_limit_s,
                         drop column if exists points;
alter table app_settings drop column if exists default_time_limit_s,
                         drop column if exists default_points,
                         drop column if exists speed_bonus;

create view participant_scores
with (security_invoker = on) as
select
  p.id            as participant_id,
  p.session_id,
  p.code,
  p.full_name,
  p.display_name,
  p.attempt_no,
  p.started_at,
  p.finished_at,
  -- Cộng thời gian suy nghĩ từng câu, không phải đồng hồ liên tục: giữa các câu còn màn
  -- đúng/sai + giải thích, thời gian đọc ở đó không nên tính vào thành tích.
  coalesce(sum(a.time_ms), 0)::int                                as total_time_ms,
  coalesce(count(a.id), 0)::int                                   as answered_count,
  coalesce(sum(case when a.is_correct then 1 else 0 end), 0)::int as correct_count
from participants p
left join answers a on a.participant_id = p.id
group by p.id;

-- Mỗi mã số chỉ lấy lượt làm tốt nhất (nhiều câu đúng nhất, rồi nhanh nhất).
create view leaderboard
with (security_invoker = on) as
with best as (
  select distinct on (session_id, code) *
  from participant_scores
  order by session_id, code, correct_count desc, total_time_ms asc, started_at asc
)
select
  *,
  rank() over (
    partition by session_id
    order by correct_count desc, total_time_ms asc, started_at asc
  )::int as rank
from best;

-- Drop view làm mất grant → phải revoke lại, nếu không anon key đọc được bảng xếp hạng.
revoke all on participant_scores from anon, authenticated;
revoke all on leaderboard        from anon, authenticated;
