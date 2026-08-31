-- PCCC26 · schema khởi tạo
-- Chạy toàn bộ file này trong Supabase → SQL Editor.
--
-- Nguyên tắc bảo mật: RLS bật trên mọi bảng và KHÔNG tạo policy nào.
-- Client (anon key) do đó không đọc/ghi được gì. Toàn bộ truy cập đi qua
-- server action / route handler bằng service-role key. Đáp án đúng
-- (questions.correct) không bao giờ được gửi xuống client trước khi trả lời.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- Cấu hình chung (đúng 1 hàng)
-- ─────────────────────────────────────────────────────────────
create table if not exists app_settings (
  id                   int primary key default 1 check (id = 1),
  default_time_limit_s int  not null default 20 check (default_time_limit_s between 5 and 300),
  default_points       int  not null default 1000 check (default_points between 1 and 100000),
  speed_bonus          bool not null default true,   -- càng nhanh càng nhiều điểm (kiểu Kahoot)
  show_feedback        bool not null default true,   -- hiện đúng/sai ngay sau mỗi câu
  multi_all_or_nothing bool not null default true,   -- câu nhiều đáp án: đúng hết mới có điểm
  updated_at           timestamptz not null default now()
);

insert into app_settings (id) values (1) on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Bộ câu hỏi
-- ─────────────────────────────────────────────────────────────
create table if not exists question_sets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id           uuid primary key default gen_random_uuid(),
  set_id       uuid not null references question_sets(id) on delete cascade,
  order_index  int  not null default 0,
  type         text not null check (type in ('single', 'multi', 'boolean', 'text')),
  content      text not null,
  image_url    text,
  -- options: ["113","114",...] cho single/multi; null cho boolean/text
  options      jsonb,
  -- correct: single -> [1] (chỉ số trong options) · multi -> [0,2]
  --          boolean -> [true] · text -> ["114","một trăm mười bốn"]
  correct      jsonb not null,
  time_limit_s int,               -- null = dùng mặc định của session
  points       int,               -- null = dùng mặc định của session
  explanation  text,
  created_at   timestamptz not null default now()
);

create index if not exists questions_set_order_idx on questions (set_id, order_index);

-- ─────────────────────────────────────────────────────────────
-- Lượt chơi (session)
-- ─────────────────────────────────────────────────────────────
create table if not exists sessions (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  question_set_id uuid not null references question_sets(id) on delete restrict,
  status          text not null default 'active' check (status in ('active', 'finished')),
  -- snapshot cấu hình lúc mở lượt: đổi settings sau đó không làm lệch điểm đã chấm
  settings        jsonb not null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);

create index if not exists sessions_status_idx on sessions (status, started_at desc);

-- chỉ cho phép tối đa 1 lượt đang mở
create unique index if not exists sessions_one_active_idx
  on sessions ((status)) where status = 'active';

-- ─────────────────────────────────────────────────────────────
-- Thí sinh
-- ─────────────────────────────────────────────────────────────
create table if not exists participants (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  code           text not null check (code ~ '^[A-Z]{2}[0-9]{6}$'),
  full_name      text not null check (length(btrim(full_name)) > 0),
  display_name   text not null,                 -- "HE180234 - Trần Minh Khôi"
  attempt_no     int  not null default 1,
  -- thứ tự câu đã trộn + thứ tự đáp án của từng câu, lưu để reload không đổi
  question_order jsonb not null,
  cursor_index   int  not null default 0,       -- đang ở câu thứ mấy
  served_at      timestamptz,                   -- lúc phát câu hiện tại (để tính thời gian)
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create unique index if not exists participants_attempt_idx
  on participants (session_id, code, attempt_no);
create index if not exists participants_session_idx on participants (session_id);

-- ─────────────────────────────────────────────────────────────
-- Câu trả lời
-- ─────────────────────────────────────────────────────────────
create table if not exists answers (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  question_id    uuid not null references questions(id) on delete cascade,
  order_index    int  not null,                 -- vị trí câu trong bài của thí sinh này
  given          jsonb,                         -- null = hết giờ, không chọn gì
  is_correct     bool not null,
  time_ms        int  not null check (time_ms >= 0),
  score          int  not null check (score >= 0),
  answered_at    timestamptz not null default now()
);

-- mỗi câu chỉ nhận đáp án đúng một lần
create unique index if not exists answers_once_idx on answers (participant_id, question_id);
create index if not exists answers_participant_idx on answers (participant_id, order_index);

-- ─────────────────────────────────────────────────────────────
-- View tổng hợp
-- ─────────────────────────────────────────────────────────────

-- Điểm của từng lượt làm bài
create or replace view participant_scores
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
  coalesce(sum(a.score), 0)::int                          as total_score,
  coalesce(sum(a.time_ms), 0)::int                        as total_time_ms,
  coalesce(count(a.id), 0)::int                           as answered_count,
  coalesce(sum(case when a.is_correct then 1 else 0 end), 0)::int as correct_count
from participants p
left join answers a on a.participant_id = p.id
group by p.id;

-- Bảng xếp hạng: mỗi mã số chỉ lấy lượt làm có điểm cao nhất
create or replace view leaderboard
with (security_invoker = on) as
with best as (
  select distinct on (session_id, code) *
  from participant_scores
  order by session_id, code, total_score desc, total_time_ms asc, started_at asc
)
select
  *,
  rank() over (
    partition by session_id
    order by total_score desc, total_time_ms asc, started_at asc
  )::int as rank
from best;

-- ─────────────────────────────────────────────────────────────
-- RLS: bật, không policy → anon key không truy cập được gì
-- ─────────────────────────────────────────────────────────────
alter table app_settings  enable row level security;
alter table question_sets enable row level security;
alter table questions     enable row level security;
alter table sessions      enable row level security;
alter table participants  enable row level security;
alter table answers       enable row level security;

-- View chạy với security_invoker nên đã chịu RLS của bảng gốc,
-- nhưng vẫn thu hồi quyền cho chắc.
revoke all on participant_scores from anon, authenticated;
revoke all on leaderboard        from anon, authenticated;
