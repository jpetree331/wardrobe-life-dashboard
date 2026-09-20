-- Wardrobe — scheduled reading plans (Data room, Plans tab).
-- Run this once in Supabase SQL Editor (after 0001 … 0017).
-- Idempotent: safe to re-run. ADDITIVE ONLY — no existing plan, column,
-- constraint, or completion row is altered.
--
-- A classic plan (0005) is "a list of books read once, in order", with
-- completions unique per (plan, book, chapter). A SCHEDULED plan has a
-- fixed day-by-day schedule that ships with the app (e.g. the four-track
-- One-Year Bible plan) and points at it via `preset_key`.
--
-- Scheduled plans repeat chapters — Psalms ~2.5x, the Gospels twice — so
-- "Psalm 2 on day 2" and "Psalm 2 on day 364" must be separate checkmarks.
-- That's why they get their own completions table keyed by DAY, rather
-- than loosening the unique constraint on data_plan_completions.

alter table data_reading_plans
  add column if not exists preset_key text;

create table if not exists data_plan_day_completions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  plan_id       uuid not null references data_reading_plans(id) on delete cascade,
  -- 1-based day number within the plan's schedule.
  day_number    int  not null check (day_number between 1 and 400),
  book          text not null,
  chapter       int  not null check (chapter >= 1),
  completed_at  timestamptz not null default now(),
  unique (plan_id, day_number, book, chapter)
);
create index if not exists data_plan_day_completions_plan_idx
  on data_plan_day_completions (plan_id);

-- Row-Level Security
alter table data_plan_day_completions enable row level security;

drop policy if exists data_plan_day_completions_owner_all on data_plan_day_completions;
create policy data_plan_day_completions_owner_all on data_plan_day_completions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
