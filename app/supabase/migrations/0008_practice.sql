-- Wardrobe — Sanctuary practice tracking (Stillness + Listening Prayer).
-- Run this once in Supabase SQL Editor (after 0001 … 0007).
-- Idempotent: safe to re-run.
--
-- Two new columns on `entries` capture contemplative practice alongside
-- each Sanctuary journal entry:
--
--   listening_prayer    boolean — a simple yes/no for the day.
--   stillness_sessions  jsonb   — an array of stillness sittings, each
--                                 { "start": "HH:MM"|null,
--                                   "end":   "HH:MM"|null,
--                                   "minutes": <int> }.
--                                 Times are the user's local clock; only
--                                 the computed `minutes` is aggregated, so
--                                 no timezone is stored. Multiple sittings
--                                 per day sum to the daily total.
--
-- These live ON the entry (not a separate table) by design — the user
-- commits to a Sanctuary entry each day, even a stub, so practice rides
-- the entry's existing RLS, date, and optimistic-save pipeline. The Data
-- room's Stillness tab aggregates by entry_date, summing minutes and
-- OR-ing listening_prayer across any entries that share a date.
--
-- Both columns are NOT NULL with safe defaults, so every existing row
-- (and every future insert that doesn't mention them) is valid with no
-- backfill needed.

alter table entries
  add column if not exists listening_prayer boolean not null default false;

alter table entries
  add column if not exists stillness_sessions jsonb not null default '[]'::jsonb;

-- A partial index over rows that actually record practice keeps the
-- Stillness tab's "give me every entry with practice" scan cheap without
-- bloating the index with the (common) no-practice rows.
create index if not exists entries_practice_idx
  on entries (user_id, entry_date)
  where listening_prayer = true or stillness_sessions <> '[]'::jsonb;
