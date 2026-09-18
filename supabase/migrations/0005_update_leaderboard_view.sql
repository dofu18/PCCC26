-- PCCC26 · Cập nhật view cho leaderboard để bao gồm email

-- 1. Xoá view cũ để tạo lại với cấu trúc mới
drop view if exists leaderboard;
drop view if exists participant_scores;

-- 2. Tạo lại participant_scores bao gồm email
-- Lưu ý: Không dùng score vì đã bị drop trong migration 0003
create or replace view participant_scores
with (security_invoker = on) as
select
  p.id            as participant_id,
  p.session_id,
  p.code,
  p.full_name,
  p.email,
  p.display_name,
  p.attempt_no,
  p.started_at,
  p.finished_at,
  coalesce(sum(a.time_ms), 0)::int                                as total_time_ms,
  coalesce(count(a.id), 0)::int                                   as answered_count,
  coalesce(sum(case when a.is_correct then 1 else 0 end), 0)::int as correct_count
from participants p
left join answers a on a.participant_id = p.id
group by p.id, p.email;

-- 3. Tạo lại leaderboard
create or replace view leaderboard
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

-- 4. Revoke quyền truy cập (giống như 0003_no_score.sql)
revoke all on participant_scores from anon, authenticated;
revoke all on leaderboard        from anon, authenticated;
