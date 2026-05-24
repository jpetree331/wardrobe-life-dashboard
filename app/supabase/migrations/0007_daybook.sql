-- Wardrobe — Daybook room (Build 1).
-- Run this once in Supabase SQL Editor (after 0001 … 0006).
-- Idempotent: safe to re-run.
--
-- Daybook is a time-block scheduler. Visually distinct from the
-- parchment rooms — uses a vibrant kid-puzzle palette — but the data
-- model follows the same conventions (RLS scoped to auth.uid(),
-- timestamptz UTC, updated_at trigger).
--
-- Four tables:
--   daybook_categories — user-defined block categories with custom colors
--   daybook_blocks     — the time blocks themselves
--   daybook_templates  — reusable block presets the user can drop on a day
--   daybook_goals      — weekly goals (free-form text + done flag)

-- ── Categories ─────────────────────────────────────────────────────────
-- User-defined. The handoff design ships with 6 starter categories
-- (Deep Work, Meetings, Personal, Health, Admin, Break) but the user
-- can rename, recolor, reorder, add, or delete them freely. We seed the
-- starters lazily from the client on first room visit if the user has
-- none yet — not as a SQL default, so adding extra users to the app
-- doesn't auto-seed for them either.
create table if not exists daybook_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Display name, e.g. "Deep Work". Unique per user.
  name        text not null,
  -- Color stored as a CSS-parseable string. Hex (#E73A1A) for portability;
  -- can hold oklch(...) too if a future color picker emits that.
  color       text not null,
  -- Smaller values render first in the sidebar list. Defaults to a
  -- generous gap so manual reordering doesn't immediately fight us.
  sort_order  int  not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists daybook_categories_user_sort_idx
  on daybook_categories (user_id, sort_order);

-- ── Blocks ─────────────────────────────────────────────────────────────
create table if not exists daybook_blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  -- Nullable so deleting a category orphans (not destroys) its blocks.
  -- Orphaned blocks render in a neutral fallback color and the user can
  -- re-assign them in the editor modal.
  category_id uuid references daybook_categories(id) on delete set null,
  notes       text,
  -- UTC timestamps. Client renders in the local timezone via Intl APIs.
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  check (end_at > start_at),
  -- Recurrence is stored but NOT yet materialized in queries by Build 1 —
  -- a "daily" block on May 24 doesn't auto-show on May 25 until Build 2+
  -- wires the expansion logic. The field is here so the editor modal can
  -- save it and we don't need a schema bump later.
  recur       text not null default 'none' check (recur in ('none', 'daily', 'weekdays', 'weekly')),
  -- Pomodoro-driven tracking. Populated when a block is the active
  -- pomodoro target.
  tracked_planned_min int,
  tracked_actual_min  int,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Date-range queries are the dominant access pattern (load blocks for
-- this day / this week / this month). Index on user_id + start_at.
create index if not exists daybook_blocks_user_start_idx
  on daybook_blocks (user_id, start_at);
create index if not exists daybook_blocks_category_idx
  on daybook_blocks (category_id);

-- ── Templates ──────────────────────────────────────────────────────────
-- Reusable block presets the user drags onto a day. start_hint is a
-- decimal hour (e.g. 12.5 for 12:30) so the template "wants" to land
-- around that time when dropped without an explicit drop position.
create table if not exists daybook_templates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  duration_min int  not null check (duration_min > 0 and duration_min <= 24 * 60),
  category_id  uuid references daybook_categories(id) on delete set null,
  start_hint   numeric(4, 2),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists daybook_templates_user_idx
  on daybook_templates (user_id);

-- ── Goals ──────────────────────────────────────────────────────────────
-- Free-text weekly goals. for_week stores the Sunday-anchored start date
-- of the goal's week; NULL means "persistent / not week-scoped" (the
-- Build 1 UI shows current-week + persistent goals together).
create table if not exists daybook_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  text        text not null,
  done        boolean not null default false,
  -- Optional free-text meta like "Ch. 6 of 9".
  meta        text,
  for_week    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists daybook_goals_user_week_idx
  on daybook_goals (user_id, for_week);

-- ── updated_at triggers (reuse set_updated_at from 0001) ───────────────
drop trigger if exists daybook_categories_set_updated_at on daybook_categories;
create trigger daybook_categories_set_updated_at
  before update on daybook_categories
  for each row execute function set_updated_at();

drop trigger if exists daybook_blocks_set_updated_at on daybook_blocks;
create trigger daybook_blocks_set_updated_at
  before update on daybook_blocks
  for each row execute function set_updated_at();

drop trigger if exists daybook_templates_set_updated_at on daybook_templates;
create trigger daybook_templates_set_updated_at
  before update on daybook_templates
  for each row execute function set_updated_at();

drop trigger if exists daybook_goals_set_updated_at on daybook_goals;
create trigger daybook_goals_set_updated_at
  before update on daybook_goals
  for each row execute function set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────
alter table daybook_categories enable row level security;
alter table daybook_blocks     enable row level security;
alter table daybook_templates  enable row level security;
alter table daybook_goals      enable row level security;

drop policy if exists daybook_categories_owner_all on daybook_categories;
create policy daybook_categories_owner_all on daybook_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists daybook_blocks_owner_all on daybook_blocks;
create policy daybook_blocks_owner_all on daybook_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists daybook_templates_owner_all on daybook_templates;
create policy daybook_templates_owner_all on daybook_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists daybook_goals_owner_all on daybook_goals;
create policy daybook_goals_owner_all on daybook_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
