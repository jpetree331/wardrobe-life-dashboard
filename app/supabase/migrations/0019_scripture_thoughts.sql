-- Wardrobe — a second writing page on each Sanctuary entry: Scripture Thoughts.
-- Run this once in Supabase SQL Editor (after 0001 … 0018).
-- Idempotent: safe to re-run. ADDITIVE ONLY — no existing column changes.
--
-- The Sanctuary page gets two tabs: Journal (the existing `body`, still the
-- default) and Scripture (this column). Same editor, same HTML,
-- same AI marks; the Writing stats count both as the user's own words.
--
-- NOT NULL with a '' default: every existing row (and Timeline rows, which
-- share this table) is valid with no backfill.

alter table entries
  add column if not exists scripture_thoughts text not null default '';
