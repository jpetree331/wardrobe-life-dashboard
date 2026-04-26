# Life Board — Timeline (Handoff)

This is a focused handoff for **just the Timeline tab**. The design file is the
source of truth for look-and-feel; this README tells you how to wire it up to
Supabase and link it to the Sanctuary prayer-journal entries.

> **Design file:** `design/Timeline.html` — open this in a browser to see the
> exact visual target. Match the typography, spacing, year-tab chrome, and
> ✦ link affordance pixel-for-pixel.

---

## What you're building

A personal one-sentence-per-day timeline:

- **Year tabs** along the top (Excel-like). Click a year to view that sheet.
- **Sheet rows**: `Date | One-sentence highlight | Tags | ✦` (Sanctuary link).
- **Inline edit** the sentence. **Click a row** to open a side editor for date,
  tags, and viewing the linked Sanctuary entry.
- **Import** `.xlsx` / `.csv` / plain-text. Each sheet in an .xlsx is treated
  as a year. **Export** writes the same shape back, so it round-trips with the
  user's existing Excel timeline.
- **Sanctuary linking**: a row's ✦ icon appears when a Sanctuary entry exists
  for that same `date`. Hover → popover preview. Click → opens Sanctuary at
  that date.

---

## Supabase schema

Two tables (one new, one already exists from Sanctuary). The link is the
**date** — no foreign key needed; the join is a simple equality match.

```sql
-- Already exists from Sanctuary tab — included here for reference.
create table if not exists sanctuary_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  entry_date  date not null,                 -- the date the entry is *about*
  title       text not null,
  body_html   text,                          -- rich-text editor content
  scripture   text,                          -- e.g. "Romans 8:31-39"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sanctuary_entries_user_date_idx
  on sanctuary_entries (user_id, entry_date);

-- New: the timeline.
create table if not exists timeline_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  entry_date  date not null,
  summary     text not null,                 -- the one sentence
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, entry_date)               -- one sentence per day per user
);
create index if not exists timeline_entries_user_date_idx
  on timeline_entries (user_id, entry_date);

-- RLS: user can only see their own.
alter table timeline_entries enable row level security;
create policy "own rows" on timeline_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### The link view

Use a view (or just a join in your query layer) so the timeline can render the
✦ icon and the popover preview without a second round-trip:

```sql
create or replace view timeline_with_sanctuary as
select
  t.id, t.user_id, t.entry_date, t.summary, t.tags, t.updated_at,
  s.id          as sanctuary_id,
  s.title       as sanctuary_title,
  s.scripture   as sanctuary_scripture
from timeline_entries t
left join sanctuary_entries s
  on s.user_id = t.user_id and s.entry_date = t.entry_date;
```

`sanctuary_id IS NULL` → render the disabled `·` glyph. Otherwise render the
gold `✦` and link to `/sanctuary/{sanctuary_id}`.

---

## TypeScript types

```ts
export type TimelineEntry = {
  id: string;
  user_id: string;
  entry_date: string;        // 'YYYY-MM-DD'
  summary: string;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type TimelineRow = TimelineEntry & {
  sanctuary_id: string | null;
  sanctuary_title: string | null;
  sanctuary_scripture: string | null;
};
```

---

## Endpoints / queries

Using `@supabase/supabase-js`:

```ts
// List a year (or all)
const { data } = await supabase
  .from('timeline_with_sanctuary')
  .select('*')
  .gte('entry_date', `${year}-01-01`)
  .lte('entry_date', `${year}-12-31`)
  .order('entry_date', { ascending: false });

// Upsert (insert or replace by date — date is the natural key per user)
await supabase.from('timeline_entries').upsert({
  user_id, entry_date, summary, tags
}, { onConflict: 'user_id,entry_date' });

// Delete
await supabase.from('timeline_entries').delete().eq('id', id);

// All distinct years for tabs
const { data } = await supabase.rpc('timeline_years');
// or: select distinct extract(year from entry_date)::int as year ...
```

Helper RPC for the year tabs (optional — you can also derive client-side):

```sql
create or replace function timeline_years()
returns table(year int, count bigint) language sql stable as $$
  select extract(year from entry_date)::int as year, count(*)
  from timeline_entries
  where user_id = auth.uid()
  group by 1
  order by 1 desc;
$$;
```

---

## Importing the user's existing Excel timeline

The user has years of one-sentence-per-day entries in Excel, with **a sheet per
year**. The design file's importer demonstrates the contract: read each sheet,
treat the sheet name as the year if rows don't carry a full date, and look for
column headers that are reasonable variants:

- Date column: `Date` / `date` / `Day` / or `Year` + `Month` + `Day`
- Summary column: `Summary` / `Highlight` / `One-sentence highlight` / `Note` / `Entry`
- Tags column: `Tags` / `Categories` (split on `,` or `;`)

After parsing, dedupe on `(user_id, entry_date)` — the unique constraint will
also catch duplicates server-side. Use `onConflict: 'user_id,entry_date'` on
the upsert if the user wants the import to overwrite existing days, or skip
existing rows if they want it additive (ask them on the import dialog).

The design file uses **SheetJS** (`xlsx` package on npm) — same library is
fine for the production app:

```bash
npm install xlsx
```

Export should write the same shape back: `timeline.xlsx` with one sheet per
year, columns `Date | One-sentence highlight | Tags`.

---

## Sanctuary back-link (small but important)

When Sanctuary opens an entry, surface the day's timeline sentence in the
Inspector — small italic line under the entry title:

> *Timeline · Apr 19, 2026* — "Walked to Emmaus before dawn; the sky was
> lavender and the air felt held."

One read of `timeline_entries` by `(user_id, entry_date)` is enough. This
keeps the link visible **both directions** without forcing a separate "back to
timeline" navigation.

Sanctuary should also accept a deep link: `/sanctuary?date=YYYY-MM-DD` — open
the entry for that date if one exists, or open a new-entry composer prefilled
with that date. The Timeline design file links to
`Sanctuary.html#date=YYYY-MM-DD` — match the same shape with your real router.

---

## Visual fidelity checklist

Match these from the design file exactly:

- **Fonts**: EB Garamond (body), Cormorant Garamond (headings/eyebrows, all caps
  with `letter-spacing: 0.22em`), Sorts Mill Goudy is loaded but unused on this
  page — fine to keep loaded for consistency with Sanctuary.
- **Palette**: defined as CSS custom properties at the top of `Timeline.html`
  (`--bg`, `--page`, `--ink`, `--accent`, etc). These match Sanctuary's
  palette — share them as design tokens across both tabs.
- **Year tabs**: they sit *on* the bottom border of the tab strip — the active
  tab's bottom edge merges with the sheet below (`bottom: -1px`). Don't
  reinvent this; copy the CSS.
- **Row hover/selected**: `color-mix(in oklab, var(--bg-3) 35%/55%, transparent)`.
- **✦ icon**: `var(--accent-strong)` at rest, scales 1.15× on hover, replaced
  with a faint `·` when no Sanctuary entry exists for that date.
- **Side editor**: 380px, slides in from the right with a 280ms ease transform.

---

## Out of scope (intentionally)

The design file does not include:

- Search across years (easy to add later — `ilike` on `summary` + `tags`)
- Photos per day
- Mood/people/place columns
- Multi-user / shared timelines

Ship the core first; the user can ask for the rest after living with it.
