-- Wardrobe — Notes room: starred boards (roadmap Sprint 17).
-- Run once in the Supabase SQL Editor (after 0013). Idempotent.
--
-- (tile_color / tile_icon already exist on notes_boards since 0004; this
-- sprint finally wires them up. Only the star flag is new.)

alter table notes_boards add column if not exists starred boolean not null default false;
