-- Wardrobe — Treasury room (Build 1).
-- Run this once in Supabase SQL Editor (after 0001 … 0005).
-- Idempotent: safe to re-run.
--
-- One table for the Treasury — verses kept from Scripture reading.
-- Two kinds: 'promise' (a verse the user is holding onto as a promise from
-- God) and 'standout' (a verse that arrested her in reading but isn't
-- framed as a promise). Highlight styling is per-kind in the UI; promises
-- get a soft yellow wash, stand-outs are plain.
--
-- Verses are stored with their full text so the kept copy is preserved
-- verbatim — if the user later changes translations or the source API
-- updates its text, the kept verse stays exactly as it was held.

-- ── Treasury verses ────────────────────────────────────────────────────
create table if not exists treasury_verses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- Date the user marks the verse. Typically when she encountered it,
  -- which may be different from created_at (when the row was inserted).
  marked_on       date not null,
  -- Canonical Bible book name (e.g. "Genesis", "1 Corinthians").
  book            text not null,
  chapter         int  not null check (chapter >= 1),
  -- Verse range (inclusive). verse_to NULL = single-verse keep.
  verse_from      int  not null check (verse_from >= 1),
  verse_to        int  check (verse_to is null or verse_to >= verse_from),
  -- Verse text stored verbatim. Includes translation so the user can see
  -- exactly what she kept regardless of future source changes.
  verse_text      text not null,
  translation     text not null default 'ESV',
  -- Kind drives visual treatment in the UI.
  kind            text not null check (kind in ('promise', 'standout')),
  note            text,
  -- If this verse was promoted from a Sanctuary entry via the "✦ keep"
  -- button (Build 2), this points back. NULL = manually-added directly.
  source_entry_id uuid references entries(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Indexes for the three primary access patterns: chronological default,
-- canonical-order sort by book/chapter, and filter by kind.
create index if not exists treasury_verses_user_marked_idx
  on treasury_verses (user_id, marked_on desc);
create index if not exists treasury_verses_user_book_chapter_idx
  on treasury_verses (user_id, book, chapter);
create index if not exists treasury_verses_user_kind_idx
  on treasury_verses (user_id, kind);

-- Full-text search across verse_text + note. The room's search box will
-- query this; tsvector keeps it fast even at thousands of rows.
create index if not exists treasury_verses_fts_idx
  on treasury_verses using gin (
    to_tsvector('english', coalesce(verse_text, '') || ' ' || coalesce(note, ''))
  );

-- ── updated_at trigger (reuses set_updated_at from 0001) ───────────────
drop trigger if exists treasury_verses_set_updated_at on treasury_verses;
create trigger treasury_verses_set_updated_at
  before update on treasury_verses
  for each row execute function set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────
alter table treasury_verses enable row level security;

drop policy if exists treasury_verses_owner_all on treasury_verses;
create policy treasury_verses_owner_all on treasury_verses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
