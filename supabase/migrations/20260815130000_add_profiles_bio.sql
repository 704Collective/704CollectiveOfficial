-- Additive column. Fixes platform-wide profile save 400: dashboard/profile writes
-- full_name, bio, phone in one update and bio never existed on any environment.

alter table public.profiles add column if not exists bio text;
