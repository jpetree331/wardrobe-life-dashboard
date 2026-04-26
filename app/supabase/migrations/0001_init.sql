-- Wardrobe — initial schema. Single-user app; RLS enforces "this user only".
--
-- Run this once in your Supabase project's SQL Editor:
--   1. Go to https://supabase.com/dashboard → your project → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--
-- Idempotent: safe to re-run if you need to.

-- ── Entries (Sanctuary + Timeline both write here, scoped by `room`) ───────
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  room text not null check (room in ('sanctuary', 'timeline')),
  entry_date date not null,
  title text,
  body text,
  body_type text not null default 'rich' check (body_type in ('rich', 'plain')),
  tags text[] not null default '{}',
  scripture_refs text[] not null default '{}',
  -- Sanctuary entry types: 'lectio' | 'examen' | 'prayer' | 'scripture' | 'journal' | null
  -- Timeline entries leave this null.
  entry_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entries_user_room_date
  on entries(user_id, room, entry_date desc);

-- Auto-update `updated_at` on row update.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists entries_set_updated_at on entries;
create trigger entries_set_updated_at
  before update on entries
  for each row execute function set_updated_at();

-- ── User preferences (Tweaks panel state, font choices, etc.) ─────────────
create table if not exists user_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tweaks jsonb not null default '{}',
  font jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

drop trigger if exists user_prefs_set_updated_at on user_prefs;
create trigger user_prefs_set_updated_at
  before update on user_prefs
  for each row execute function set_updated_at();

-- ── Row-Level Security ────────────────────────────────────────────────────
alter table entries     enable row level security;
alter table user_prefs  enable row level security;

drop policy if exists entries_owner_all  on entries;
create policy entries_owner_all
  on entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_prefs_owner_all on user_prefs;
create policy user_prefs_owner_all
  on user_prefs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
