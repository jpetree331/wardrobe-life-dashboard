-- Wardrobe — Build 2 schema additions.
-- Run this once in Supabase SQL Editor (after 0001_init.sql).
-- Idempotent: safe to re-run.

-- One timeline row per (user, date). Partial unique index so it only applies
-- to room='timeline' — sanctuary still allows multiple entries per day.
create unique index if not exists entries_timeline_one_per_day
  on entries (user_id, entry_date)
  where room = 'timeline';

-- Convenience view for the Timeline page: one row per timeline entry,
-- joined to the FIRST sanctuary entry on the same date (if any).
-- Renders the ✦ link + popover preview without a second round-trip.
--
-- security_invoker=on so RLS on `entries` evaluates as the *querying* user,
-- not the view's owner. Without this, on PG ≥15 the view would bypass RLS.
create or replace view timeline_with_sanctuary
  with (security_invoker = on)
as
select
  t.id,
  t.user_id,
  t.entry_date,
  t.title,
  t.body         as summary,
  t.tags,
  t.created_at,
  t.updated_at,
  s.id           as sanctuary_id,
  s.title        as sanctuary_title,
  s.scripture_refs as sanctuary_scripture_refs
from entries t
left join lateral (
  select s.id, s.title, s.scripture_refs
  from entries s
  where s.user_id = t.user_id
    and s.room = 'sanctuary'
    and s.entry_date = t.entry_date
  order by s.created_at asc
  limit 1
) s on true
where t.room = 'timeline';
