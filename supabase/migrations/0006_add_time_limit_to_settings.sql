-- PCCC26 · Thêm giới hạn thời gian làm bài vào cấu hình
alter table if exists app_settings add column if not exists time_limit_minutes int not null default 0 check (time_limit_minutes >= 0);
