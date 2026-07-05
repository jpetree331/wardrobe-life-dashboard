-- Wardrobe — Notes room: file cards (roadmap Sprint 6).
-- Run once in the Supabase SQL Editor (after 0009). Idempotent.
--
-- Adds 'file' to the notes_cards type CHECK. File payload shape (jsonb):
--   { storagePath, filename, mimeType, sizeBytes }
-- Files share the notes-media bucket and its 0009 owner policies; the
-- same trash rule applies (soft-delete never touches storage objects).

alter table notes_cards drop constraint if exists notes_cards_type_check;
alter table notes_cards add constraint notes_cards_type_check
  check (type in ('note', 'todo', 'heading', 'link', 'document', 'board', 'image', 'file'));
