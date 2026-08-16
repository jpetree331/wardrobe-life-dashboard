-- Wardrobe — fiction-work log (Data room, Writing tab).
-- Run this once in Supabase SQL Editor (after 0001 … 0015).
-- Idempotent: safe to re-run.
--
-- A row = "I worked on my fiction this day" — editing in Scrivener,
-- drafting longhand, anywhere. The novel itself does NOT live in
-- Wardrobe (deliberately: the journal stands alone); this table only
-- witnesses the days. Minutes and words are optional color — a bare
-- row still counts the day. Multiple rows per date are allowed
-- (morning + evening sessions) and aggregate by date.

create table if not exists fiction_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Calendar date of the session, user's local time at insert.
  entry_date   date not null,
  minutes      int  not null default 0 check (minutes >= 0),
  words        int  not null default 0 check (words >= 0),
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists fiction_log_user_date_idx
  on fiction_log (user_id, entry_date desc);

-- updated_at trigger (reuses set_updated_at from 0001)
drop trigger if exists fiction_log_set_updated_at on fiction_log;
create trigger fiction_log_set_updated_at
  before update on fiction_log
  for each row execute function set_updated_at();

-- Row-Level Security
alter table fiction_log enable row level security;

drop policy if exists fiction_log_owner_all on fiction_log;
create policy fiction_log_owner_all on fiction_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
