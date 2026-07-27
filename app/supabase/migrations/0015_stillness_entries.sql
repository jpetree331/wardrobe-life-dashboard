-- Wardrobe — standalone Stillness entries (Data room).
-- Run this once in Supabase SQL Editor (after 0001 … 0014).
-- Idempotent: safe to re-run.
--
-- Migration 0008 put practice fields ON Sanctuary entries by design ("the
-- user commits to a Sanctuary entry each day, even a stub"). This table
-- relaxes that: a stillness sitting or listening-prayer day can now be
-- logged from the Data room's Stillness tab without creating a journal
-- entry. Rows here use the SAME shapes as 0008 (`stillness_sessions` as
-- an array of { start, end, minutes }; `listening_prayer` boolean), so
-- the Stillness tab simply merges both sources by date.

create table if not exists stillness_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  -- Calendar date of the sitting, user's local time at insert.
  entry_date         date not null,
  listening_prayer   boolean not null default false,
  -- Same shape as entries.stillness_sessions (0008):
  --   [{ "start": "HH:MM"|null, "end": "HH:MM"|null, "minutes": <int> }]
  stillness_sessions jsonb not null default '[]'::jsonb,
  note               text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists stillness_entries_user_date_idx
  on stillness_entries (user_id, entry_date desc);

-- updated_at trigger (reuses set_updated_at from 0001)
drop trigger if exists stillness_entries_set_updated_at on stillness_entries;
create trigger stillness_entries_set_updated_at
  before update on stillness_entries
  for each row execute function set_updated_at();

-- Row-Level Security
alter table stillness_entries enable row level security;

drop policy if exists stillness_entries_owner_all on stillness_entries;
create policy stillness_entries_owner_all on stillness_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
