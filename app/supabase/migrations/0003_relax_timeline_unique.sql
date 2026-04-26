-- Wardrobe — Build 2 follow-up.
-- Run this once in Supabase SQL Editor (after 0001 + 0002).
-- Idempotent: safe to re-run.
--
-- Reasoning: importing the user's existing "Reckoning of Years" spreadsheet
-- surfaced ~6 dates where she'd recorded multiple distinct events per day
-- (e.g. lab lunch in the morning, an evening prayer; a science demo + a
-- food-thief observation). The original one-row-per-day partial index was
-- right as a UX nudge for going forward, but it's wrong for backfilling
-- legacy data. Drop it so the Timeline can carry "1 sentence per event"
-- where the day has multiple noteworthy moments.
--
-- The de-duplication policy now lives in the importer: skip incoming rows
-- whose (entry_date, body) already exists for that user. Distinct events
-- on the same day import as separate rows.

drop index if exists entries_timeline_one_per_day;
