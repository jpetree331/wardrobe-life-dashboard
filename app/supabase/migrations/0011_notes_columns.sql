-- Wardrobe — Notes room: column containers (roadmap Sprint 8).
-- Run once in the Supabase SQL Editor (after 0010). Idempotent.
--
-- Columns are cards (type 'column', payload { title, collapsed? }) that
-- contain other cards. Containment is two nullable columns on notes_cards:
--   parent_column  → the column card this card lives inside (null = free)
--   column_index   → 0-based order within that column
-- A card with parent_column set ignores its x/y (the column lays it out);
-- its payload keeps lastFreeX/lastFreeY so dragging out can restore a
-- sensible position. Columns cannot nest (enforced in the app).
--
-- Deleting a column soft-deletes column + members as ONE composite trash
-- entry (kind 'column') restorable as a unit.

alter table notes_cards drop constraint if exists notes_cards_type_check;
alter table notes_cards add constraint notes_cards_type_check
  check (type in ('note', 'todo', 'heading', 'link', 'document', 'board', 'image', 'file', 'column'));

alter table notes_cards add column if not exists parent_column uuid
  references notes_cards(id) on delete cascade;
alter table notes_cards add column if not exists column_index int;

create index if not exists notes_cards_parent_column_idx
  on notes_cards (parent_column);

alter table notes_trash drop constraint if exists notes_trash_kind_check;
alter table notes_trash add constraint notes_trash_kind_check
  check (kind in ('card', 'todo_item', 'board', 'column'));
