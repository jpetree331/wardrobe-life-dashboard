-- Wardrobe — Notes room (Build 1).
-- Run this once in Supabase SQL Editor (after 0001 + 0002 + 0003).
-- Idempotent: safe to re-run.
--
-- Three tables:
--   notes_boards  — recursive folder tree (root + nested boards)
--   notes_cards   — every visible card (note, todo, heading, link, document, board)
--   notes_trash   — soft-delete bucket; nothing is purged automatically
--
-- Card type-specific data lives in `payload jsonb` on notes_cards. See the
-- handoff README for the JSON shapes per card type.

-- ── Boards ─────────────────────────────────────────────────────────────
create table if not exists notes_boards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references notes_boards(id) on delete cascade,  -- null = root
  name        text not null default 'Untitled board',
  -- Visual properties of the board's *tile* on its parent's canvas.
  -- For the root board these are unused; we use the same row to track the
  -- root so every user has a single guaranteed root board.
  tile_x      numeric not null default 0,
  tile_y      numeric not null default 0,
  tile_color  text    not null default 'sky',
  tile_icon   text    not null default 'grid',
  is_root     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists notes_boards_user_parent_idx
  on notes_boards (user_id, parent_id);

-- One root board per user. Partial unique index since most rows aren't root.
create unique index if not exists notes_boards_one_root_per_user
  on notes_boards (user_id) where is_root = true;

-- ── Cards ──────────────────────────────────────────────────────────────
create table if not exists notes_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  board_id    uuid not null references notes_boards(id) on delete cascade,
  type        text not null check (type in ('note', 'todo', 'heading', 'link', 'document', 'board')),
  -- Position on the parent board's canvas (in canvas-local px).
  x           numeric not null default 0,
  y           numeric not null default 0,
  w           numeric,
  h           numeric,
  z           int     not null default 0,
  color       text    not null default 'paper',
  -- Type-specific payload — kept as jsonb so adding a new card type is
  -- additive. Common shapes (canonical, but not enforced):
  --   note:     { body: html }
  --   todo:     { title, items: [{ id, text, done }] }
  --   heading:  { body: text }
  --   link:     { title, url }
  --   document: { title, body: html, mode: 'icon' | 'preview' }
  --   board:    { name }   (mirror of notes_boards.name for the tile label;
  --                          the canonical name still lives on notes_boards)
  payload     jsonb   not null default '{}',
  -- For type='board' cards, link to the underlying notes_boards row that
  -- this tile *enters*. Allows nested-board navigation without a separate
  -- table for tile placement.
  board_ref   uuid references notes_boards(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists notes_cards_board_idx on notes_cards (board_id);
create index if not exists notes_cards_user_idx  on notes_cards (user_id);

-- ── Trash ──────────────────────────────────────────────────────────────
create table if not exists notes_trash (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- 'card'  = a whole card was deleted
  -- 'todo_item' = a single line removed from a to-do card (origin_card = parent card)
  -- 'board' = a whole board was deleted (with all descendants snapshotted)
  kind          text not null check (kind in ('card', 'todo_item', 'board')),
  origin_board  uuid,                  -- board the card lived on
  origin_card   uuid,                  -- for todo_item: the parent to-do card id
  snapshot      jsonb not null,        -- enough to restore the row(s)
  deleted_at    timestamptz not null default now()
);
create index if not exists notes_trash_user_idx on notes_trash (user_id, deleted_at desc);

-- ── updated_at triggers (reuse set_updated_at from 0001) ───────────────
drop trigger if exists notes_boards_set_updated_at on notes_boards;
create trigger notes_boards_set_updated_at
  before update on notes_boards
  for each row execute function set_updated_at();

drop trigger if exists notes_cards_set_updated_at on notes_cards;
create trigger notes_cards_set_updated_at
  before update on notes_cards
  for each row execute function set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────
alter table notes_boards enable row level security;
alter table notes_cards  enable row level security;
alter table notes_trash  enable row level security;

drop policy if exists notes_boards_owner_all on notes_boards;
create policy notes_boards_owner_all on notes_boards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists notes_cards_owner_all on notes_cards;
create policy notes_cards_owner_all on notes_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists notes_trash_owner_all on notes_trash;
create policy notes_trash_owner_all on notes_trash
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
