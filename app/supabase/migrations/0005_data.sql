-- Wardrobe — Data room (Build 1).
-- Run this once in Supabase SQL Editor (after 0001 + 0002 + 0003 + 0004).
-- Idempotent: safe to re-run.
--
-- Five tables for reading & Scripture tracking. Reading Plans land in
-- Build 3 but the tables ship now so the schema is settled.
--   data_scripture_reads — explicit "+Scripture" entries (manual log)
--   data_book_reads      — completed-book records (date, title, rating, etc.)
--   data_daily_page_reads — per-day page counts not tied to a completion
--   data_reading_plans   — saved reading plans (multiple per user)
--   data_plan_completions — per-(plan, book, chapter) completion log

-- ── Scripture reads (explicit log) ─────────────────────────────────────
create table if not exists data_scripture_reads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Calendar date the read happened on, in user's local time at insert.
  read_date    date not null,
  -- Canonical Bible book name (e.g. "Genesis", "1 Corinthians", "Revelation").
  book         text not null,
  chapter      int  not null check (chapter >= 1),
  -- Verse range (inclusive). NULL on either side = "whole chapter".
  verse_from   int check (verse_from is null or verse_from >= 1),
  verse_to     int check (verse_to   is null or verse_to   >= 1),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists data_scripture_reads_user_date_idx
  on data_scripture_reads (user_id, read_date desc);
create index if not exists data_scripture_reads_user_book_chapter_idx
  on data_scripture_reads (user_id, book, chapter);

-- ── Book reads (completion log) ────────────────────────────────────────
create table if not exists data_book_reads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Date book was finished.
  finished_on  date not null,
  title        text not null,
  author       text not null default '',
  pages        int  not null default 0 check (pages >= 0),
  rating       int  not null default 0 check (rating between 0 and 5),
  review       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists data_book_reads_user_date_idx
  on data_book_reads (user_id, finished_on desc);

-- ── Daily page reads (in-progress reading) ─────────────────────────────
create table if not exists data_daily_page_reads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  read_date    date not null,
  pages        int  not null check (pages > 0),
  -- Optional book context — when present, helps the heatmap tooltip
  -- and lets us roll the count up against a specific title.
  title        text,
  author       text,
  created_at   timestamptz not null default now()
);
create index if not exists data_daily_page_reads_user_date_idx
  on data_daily_page_reads (user_id, read_date desc);

-- ── Reading plans ──────────────────────────────────────────────────────
create table if not exists data_reading_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null default 'Untitled plan',
  -- Books selected for the plan, canonical names.
  books         text[] not null default '{}',
  start_date    date not null,
  end_date      date not null check (end_date >= start_date),
  -- 0=Sunday, 1=Monday, ..., 6=Saturday — which weekdays count as session days.
  days_of_week  int[] not null default '{0,1,2,3,4,5,6}',
  unit          text not null default 'chapters' check (unit in ('chapters', 'verses')),
  per_session   int  not null default 1 check (per_session between 1 and 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists data_reading_plans_user_idx
  on data_reading_plans (user_id, updated_at desc);

-- ── Plan completions ───────────────────────────────────────────────────
-- Tracks completion at the chapter level (matches the prototype's UI).
-- Reads here are SEPARATE from data_scripture_reads — completing a plan
-- session does NOT log a Scripture read, and vice versa, per Jess's rule.
create table if not exists data_plan_completions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  plan_id       uuid not null references data_reading_plans(id) on delete cascade,
  book          text not null,
  chapter       int  not null check (chapter >= 1),
  completed_at  timestamptz not null default now(),
  unique (plan_id, book, chapter)
);
create index if not exists data_plan_completions_plan_idx
  on data_plan_completions (plan_id);

-- ── updated_at triggers (reuse set_updated_at from 0001) ───────────────
drop trigger if exists data_scripture_reads_set_updated_at on data_scripture_reads;
create trigger data_scripture_reads_set_updated_at
  before update on data_scripture_reads
  for each row execute function set_updated_at();

drop trigger if exists data_book_reads_set_updated_at on data_book_reads;
create trigger data_book_reads_set_updated_at
  before update on data_book_reads
  for each row execute function set_updated_at();

drop trigger if exists data_reading_plans_set_updated_at on data_reading_plans;
create trigger data_reading_plans_set_updated_at
  before update on data_reading_plans
  for each row execute function set_updated_at();

-- ── Row-Level Security ─────────────────────────────────────────────────
alter table data_scripture_reads   enable row level security;
alter table data_book_reads        enable row level security;
alter table data_daily_page_reads  enable row level security;
alter table data_reading_plans     enable row level security;
alter table data_plan_completions  enable row level security;

drop policy if exists data_scripture_reads_owner_all on data_scripture_reads;
create policy data_scripture_reads_owner_all on data_scripture_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists data_book_reads_owner_all on data_book_reads;
create policy data_book_reads_owner_all on data_book_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists data_daily_page_reads_owner_all on data_daily_page_reads;
create policy data_daily_page_reads_owner_all on data_daily_page_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists data_reading_plans_owner_all on data_reading_plans;
create policy data_reading_plans_owner_all on data_reading_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists data_plan_completions_owner_all on data_plan_completions;
create policy data_plan_completions_owner_all on data_plan_completions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
