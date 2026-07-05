-- Wardrobe — Notes room: color swatch + comment cards (roadmap Sprint 10).
-- Run once in the Supabase SQL Editor (after 0012). Idempotent.
--
-- Payload shapes (jsonb):
--   swatch:  { hex, label? }
--   comment: { body, resolved? }   (timestamp = the row's created_at)

alter table notes_cards drop constraint if exists notes_cards_type_check;
alter table notes_cards add constraint notes_cards_type_check
  check (type in ('note', 'todo', 'heading', 'link', 'document', 'board',
                  'image', 'file', 'column', 'swatch', 'comment'));
