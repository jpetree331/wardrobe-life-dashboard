# Data — Build 2 (Stats view)

**Commit:** `68b72cb`
**Date:** 2026-05-02
**Files touched:** 4 changed, 1,119 insertions, 3 deletions
- `app/src/lib/dataAggregation.ts`
- `app/src/pages/Data.tsx`
- `app/src/pages/Data.css`
- `app/test/dataAggregation.test.ts`

---

## Position in the build

Build 2 was originally scoped as Book × Chapter + Stats together. After surveying the surface area I split it across two pushes — Book × Chapter shipped first (commit `42f1077`), Stats here. This is the second half of Build 2.

The Data room now has four working tabs (Heatmap, Calendar, Book × Chapter, Stats). Reading Plans is the only outstanding tab.

---

## What this view answers

Stats sits at the *summary* end of the room. Where Heatmap and Calendar answer "*when* did I read?", Book × Chapter answers "*what* have I read across the canon?", Stats answers:

- How much did I read this year, in concrete numbers?
- Am I currently in a streak? How long was my longest?
- Which months were strong? Which were lean?
- What's the OT / NT balance?
- Which books did I spend the most time in?
- And, year by year — how does my reading life look over time?

It's the panel you open when you want to see the shape of your year, not the texture of a specific day.

---

## Layout

Four sections, top to bottom, each in its own panel:

### 1. Year head + KPI row

A big year number (Cormorant Garamond, 38px, the "this is what we're talking about" anchor) with the day-count + longest-streak as a one-line italic subtitle. To the right: a year rail (last five years).

Below: five KPI cards that scale via `repeat(auto-fit, minmax(160px, 1fr))` so they re-flow naturally on narrow screens.

| Card | Value | Hint |
|---|---|---|
| Verses | total scripture verses for the year | "X chapter reads" |
| Distinct chapters | (book, chapter) pairs touched | "across X of 66 books" |
| Books finished | year completions | "X authors" |
| Pages read | from completions + daily-page logs | "across X days" |
| Current streak | days, with grace window | "longest X" |

KPI values use Cormorant Garamond at 28px with `font-variant-numeric: tabular-nums` so digits line up vertically across cards. Same number style across the whole view, actually — anywhere a count appears, it's tabular-nums.

### 2. Monthly columns + OT/NT donut (side-by-side)

Grid template: `1fr 320px`, collapsing to single column under 900px wide.

**Monthly chart** — twelve vertical bars in a 12-column grid, one per month. Bar height = `(value / max) * 100%` of a 140px track. Bar color level = `bucketLevelForBar(value, max)`, which buckets the bar's value as a *fraction of the year's max* (not against absolute thresholds). This means a strong month always gets the heat-5 treatment even in an early year with low absolute counts — early years don't look like nothing. Pillbar toggles Verses (Scripture) ↔ Pages (book completions + daily-page logs).

Each column shows `MONTH_SHORT[i]` underneath and the raw count below that (or `·` for empty months).

**OT/NT donut** — SVG, 180×180. Two `<circle>` elements: a track at heat-2 (NT visual default), and a foreground arc at heat-5 sized via `strokeDasharray = (otLen, c - otLen)` and rotated -90° so it starts at the top. Centre `<text>` shows the OT percentage; `<text>` below shows the "OT" label in the same Cormorant uppercase-tracked style as the rest of the room. A small legend lists raw verse counts with color dots.

The donut is intentionally simple — no animation, no tooltip, no hover state. It's a glance metric.

### 3. Top books bar

Top 10 Bible books for the year, ranked by cumulative verses. Horizontal bars in a four-column grid: `130px 1fr 70px 80px` for `name | bar-track | verse-count | "Nx read" meta`. Bar level scales against the top book's count, same `bucketLevelForBar` curve as Monthly. So the leader is always heat-5 and everything else lands relative to it.

If there are no Scripture reads for the selected year, it shows an empty state instead.

### 4. Years-in-Books retrospective

All-time table, descending. Six columns: Year · Verses · Chapter reads · Books · Pages · Days. The Year column gets the Cormorant 18px treatment (visual anchor); numeric columns are JetBrains Mono right-aligned.

**Rows are clickable.** Click any year and the page-level `year` state updates, which re-runs all the year-bound memos — KPI row, Monthly chart, donut, and Top books all snap to that year. Active row gets a tinted background and a `▸ ` prefix on the year cell, so you can see at a glance which year is currently in focus everywhere else.

Empty state: if `yearsInBooksRetro` returns nothing (no reads, no books, no daily pages logged anywhere), the table is replaced with a soft prompt to log a first read.

---

## New aggregation helpers

Five new pure exports, all in `dataAggregation.ts`. Each is generic over the read shape (using `<S extends ScriptureReadLike, B extends BookReadLike>` so callers get back their original types) and free of dependencies on the React layer or the Bible verse-count manifest.

### `computeYearStats({ year, scriptureReads, bookReads, dailyPages, versesFor, today }) → YearStats`

The KPI bundle. Returns three sub-objects:

```ts
type YearStats = {
  scripture: { verses, chapters, days, booksTouched, distinctChapters };
  books:     { finished, pages, days, authors };
  combined:  { days, streakCurrent, streakLongest };
};
```

The `versesFor` callback lets the caller decide how to count partial reads (whole-chapter = full chapter verses; verse-range = `to - from + 1`). The helper itself doesn't need to know anything about Bible structure.

### `monthlyTotalsForYear(year, byDate) → number[12]`

Drops a date→count map into 12 month-buckets. Skips out-of-year keys, NaN/negative counts. Pure projection.

### `otNtVerseSplit({ year, reads, versesFor, isOldTestament }) → { ot, nt }`

The donut's data source. Takes both `versesFor` and `isOldTestament` as injected dependencies so `dataAggregation.ts` stays decoupled from `bibleVerseCounts.ts`. `Data.tsx` wires them at the call site:

```ts
otNtVerseSplit({
  year,
  reads: scriptureReads,
  versesFor: (r) => versesInRead(r),
  isOldTestament,  // imported from bibleVerseCounts
})
```

This pattern matters: the aggregation module is a small pure leaf in the dependency tree. Every call site supplies its own classifier. We can change OT/NT membership tomorrow without touching the helper.

### `topBooksByVerses({ year, n, reads, versesFor }) → Array<{ book, verses, reads }>`

Top-N for the year (or all-time if `year: null`). Stable tie-break by book name. `n: 0` returns an empty array. Books with zero verses *and* zero read-count are dropped (defensive — covers a hypothetical where someone logs an empty read).

### `yearsInBooksRetro({ scriptureReads, bookReads, dailyPages, versesFor }) → YearRetrospective[]`

The retro table. Walks all three input arrays, assigns each row to its year (parsed from the date prefix, ignoring anything that doesn't parse), builds per-year totals. Returns descending by year.

Minor design point: `chapters` in the retro counts scripture-read *rows*, not distinct chapters. The retro table is about volume of reading activity, not coverage. The KPI row uses `distinctChapters` for coverage and `chapters` for volume — both numbers are available, both are useful.

---

## Streak semantics

These are the kind of small decisions that quietly shape how the app feels, so it's worth being explicit:

- **Longest streak** — longest consecutive run of days with *any* reading (scripture, book completion, or daily-pages log) inside `[Jan 1 .. min(Dec 31, today)]`. We don't count future days as "missed" — there's no penalty for the year not being over yet.

- **Current streak** — counts back from today if today has reading. If today is empty, we grant a **one-day grace window** and count back from yesterday instead. This matches the Strava / Duolingo convention and prevents the streak from falsely zeroing out while you're mid-day and haven't logged yet.

- **What counts as "any reading"** — the union of three day-sets: `scriptureDays`, `booksDays` (finishes + daily-pages logs), and... that's it. The combined set is just the union.

- **DST-immune** — the walk uses `formatLocalDate(d)` for cell keys (`YYYY-MM-DD` strings) and `d.setDate(d.getDate() + 1)` for advancement. Same pattern as the heatmap fix from earlier today — no millisecond arithmetic, no DST drift.

The streak math is tested for three scenarios: today has reading (returns full run), today empty + yesterday has reading (returns yesterday's run), neither has reading (returns 0).

---

## Tests

10 new tests, 37 in the dataAggregation file overall, 275 across the suite. Coverage:

- `computeYearStats`: scripture/book/combined totals against a hand-checked fixture; three streak scenarios (today reads, today empty/yesterday reads, neither)
- `monthlyTotalsForYear`: bucketing, out-of-year filter, zero/negative/NaN guards
- `otNtVerseSplit`: testament classification with injected predicate
- `topBooksByVerses`: ranking, slice-to-N, dropping zero-verse books, all-time mode (`year: null`)
- `yearsInBooksRetro`: per-year grouping, descending sort, day-set merge across all three input types

---

## Verification

- TypeScript: clean
- 275 tests pass (14 test files)
- Production build: clean (996 KB / 309 KB gzipped — modest growth from 985 / 306, expected for a new view)

---

## Design decisions worth flagging

A few things I made calls on without explicit user input. If any of them feel wrong, easy to change:

1. **Year-bound vs all-time** — KPIs, monthly, donut, and top-N are year-bound; only the retrospective is all-time. I think this matches how people read these dashboards (zoom in on a year, then zoom out for the story across years), but it could go the other way.

2. **Streak grace window** — 1 day. If you'd rather see today-or-zero, easy to flip.

3. **Top-N count** — 10. Felt right for the visual density. Could be 5 or 15.

4. **OT/NT classification** — using the canonical 66-book Protestant Bible from `bibleVerseCounts.ts`. Explicitly your earlier requirement; just flagging the dependency.

5. **No source pillbar on the donut/top-books** — those are Scripture-only by nature. (The donut is OT/NT; "top books" means Bible books here, not authors.) The Books-mode equivalent (top authors, OT/NT-style breakdown by genre, etc.) wasn't requested and would need its own design pass.

6. **Bar color scaling against the year's max** — not absolute. So a bar at heat-5 means "this is the strongest month/book *for this year*", not "this hit some objective threshold". The advantage: every year looks alive; lean years aren't all heat-1. The trade-off: you can't compare bar colors across years directly. I think this is the right call for the Stats view (which is about visualizing a single year's shape) but the Heatmap absolute-thresholding is right for its job too.

---

## What's next

- **Build 3** — Reading Plans (multi-plan support; the schema and data layer are already in place from Build 1, so this should be cleaner than Stats)
- **Build 4** — Verification pass across all five views
