-- Wardrobe — Notes room: arrows / connectors (roadmap Sprint 9).
-- Run once in the Supabase SQL Editor (after 0011). Idempotent.
--
-- Arrows are their own table (two FKs is cleaner than a card type):
--   from_card → to_card, per board, with an optional text label and a
--   style jsonb ({ dashed?: boolean } today; additive later).
-- The card FKs cascade as a backstop; the app soft-deletes attached
-- arrows into notes_trash (kind 'arrow') BEFORE a card delete so every
-- delete path stays restorable (divergence rule 1).

create table if not exists notes_arrows (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  board_id    uuid not null references notes_boards(id) on delete cascade,
  from_card   uuid not null references notes_cards(id) on delete cascade,
  to_card     uuid not null references notes_cards(id) on delete cascade,
  label       text not null default '',
  style       jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists notes_arrows_board_idx on notes_arrows (board_id);
create index if not exists notes_arrows_from_idx  on notes_arrows (from_card);
create index if not exists notes_arrows_to_idx    on notes_arrows (to_card);

drop trigger if exists notes_arrows_set_updated_at on notes_arrows;
create trigger notes_arrows_set_updated_at
  before update on notes_arrows
  for each row execute function set_updated_at();

alter table notes_arrows enable row level security;
drop policy if exists notes_arrows_owner_all on notes_arrows;
create policy notes_arrows_owner_all on notes_arrows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table notes_trash drop constraint if exists notes_trash_kind_check;
alter table notes_trash add constraint notes_trash_kind_check
  check (kind in ('card', 'todo_item', 'board', 'column', 'arrow'));
