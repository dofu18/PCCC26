-- PCCC26 · Thêm email vào bảng thí sinh
alter table if exists participants add column if not exists email text;
