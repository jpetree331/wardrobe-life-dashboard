# Data — Build 2 (Book × Chapter view)

**Commit:** `42f1077`
**Date:** 2026-05-02
**Files touched:** 4 changed, 777 insertions, 3 deletions
- `app/src/lib/dataAggregation.ts`
- `app/src/pages/Data.tsx`
- `app/src/pages/Data.css`
- `app/test/dataAggregation.test.ts`

---

## Scope call

Build 2 was originally scoped as **Book × Chapter + Stats** in one push. After surveying both surfaces honestly, I pulled the trigger on splitting:

- Book × Chapter alone: ~340 lines of UI in `Data.tsx`, ~230 lines of CSS, plus aggregation helpers and tests
- Stats: another ~600 lines (KPIs, top-N bar, monthly columns, OT/NT donut, Years-in-Books retrospective)

Combined would have crossed 1,500 lines of careful UI work in one commit — exactly the "did you do it all in one build?" territory you flagged earlier. So this commit ships **Book × Chapter only**, both modes (Scripture + Books). Stats becomes its own turn.

---

## What this view answers

It's the third Data tab, sitting between **Calendar** and **Stats** in the tab strip. The Heatmap and Calendar both answer "*when* did I read?" — this view answers a different question:

- *Which* books / chapters / authors have I spent time in?
- *How often* have I returned to each?
- *What* did I write about that passage?
- *Which* author have I read the most of?

It's the spatial counterpart to the temporal heatmap.

---

## Two modes via the existing pillbar

Same `Pillbar` component used by Heatmap and Calendar — Scripture / Books — so the muscle memory carries across all three views.

### Scripture mode (3 columns)

| Column | Width | Contents |
|---|---|---|
| Book rail | 220px | All 66 books in canonical order (OT then NT, sticky section headers). Each row shows the book name and a small read-count if any. Active book gets the inverted-ink pill treatment used elsewhere. |
| Chapter matrix | flex | Grid of chapter tiles for the selected book — `repeat(auto-fill, minmax(34px, 1fr))`. Each tile is shaded by **cumulative read fraction** (see below). Click a tile to filter the reads pane to that chapter only; click again to clear. |
| Reads pane | 280px | Every read for the selected book (or the selected chapter if filtered) — date + reference + optional note. Sanctuary-derived reads are tagged with a `sanctuary` label and a warmer-toned left rule, so it's obvious which entries came from journal prose vs. the `+ Scripture` button. |

### Books mode (3 columns, simplified)

| Column | Width | Contents |
|---|---|---|
| Author rail | 220px | All authors A→Z (case-insensitive sort) with finished counts. "Unknown author" sinks to the bottom. |
| Books pane | spans 2 cols | Selected author's finished books, newest-first. Each card shows date, title, pages, star rating, and a collapsible review body. |

Empty state in Books mode points at the `+ Book` ribbon button if you haven't logged anything yet.

---

## How chapter shading works

The heatmap uses **per-day** counts. The chapter matrix uses **cumulative fraction** instead, because the question is different — for the daily heatmap you care about "how much today?", for the chapter matrix you care about "have I lived here?"

A new helper bucketing on a gentler curve:

```
0          → 0   (never touched)
(0, 0.5)   → 1   (started but didn't finish a single read-through)
[0.5, 1)   → 2   (read most of it once)
[1, 2)     → 3   (one full read-through, give or take)
[2, 4)     → 4   (multiple read-throughs)
[4, ∞)     → 5   (deeply familiar)
```

So if you read Luke 24:13–35 (Emmaus, 23 of 53 verses ≈ 0.43) on Apr 19, and the whole chapter on Apr 20, Luke 24's cumulative fraction is ~1.43 — bucket 3. The tile darkens. Read it again and it crosses 2.0 into bucket 4.

This curve means level 3 is the threshold for "I've actually read this chapter at least once." Levels 1–2 indicate partial coverage; levels 4–5 indicate genuine returning. It tracks pretty closely to how a reading life accumulates.

---

## New aggregation helpers (pure, tested)

All in `dataAggregation.ts` — same module that holds `bucketLevel`, `buildHeatGrid`, etc. Three new exports:

### `bucketChapterReads(fraction): HeatLevel`
The curve described above. Returns 0 for non-finite/negative input.

### `aggregateScriptureByBookChapter<T extends ScriptureReadLike>(reads, fractionFor)`
Per-book rollup. Returns a `Map<book, { readCount, chapters: Map<ch, fraction>, reads: T[] }>`. Generic over the read shape so callers get back the original type (with `id`, `note`, `source`, etc. preserved). Each book's `reads` array is sorted newest-first by date inside the helper, so the UI doesn't need to re-sort.

### `aggregateBooksByAuthor<T extends BookReadLike>(bookReads)`
Per-author rollup. Returns a `Map<author, { total, pages, books: T[] }>`. Whitespace-only author strings collapse to `"Unknown author"`. Same newest-first sort inside.

Why generic? So the production callers receive `Map<string, ScriptureBookAggregate<ScriptureRead>>` and can use `r.id` for React keys, `r.source` for the sanctuary tag, etc., without casts. Tests can use the leaner `ScriptureReadLike`.

---

## Sanctuary integration — the dual-source flow keeps paying off

The `listAllScriptureReads()` merge from Build 1 keeps doing its job here. Reads tagged in Sanctuary's `scripture_refs` field automatically show up in the chapter matrix (lighting up the tile) and the reads pane (with the orange `sanctuary` chip and warmer left rule). No write hooks, no double-counting — the aggregation just consumes whatever `listAllScriptureReads()` returns.

If a single passage appears in *both* a Sanctuary entry and a manual `+ Scripture` log, the manual entry wins (preserving any custom note you wrote), per the dedupe rule from Build 1. That's transparent here — you just see one row in the reads pane, not two.

---

## CSS notes

- Three-column grid template: `220px 1fr 280px` for Scripture, `220px 1fr 1fr` for Books (where the books pane spans the right two columns)
- Each pane has its own `max-height` and `overflow-y: auto` so they scroll independently — long author lists, dense chapter matrices, and long reads panes don't drag the page around
- Sticky `rail-head` labels in the rail keep "Old Testament" / "New Testament" / "Authors" anchored as you scroll
- Selected chapter tile gets an `outline` not a `border` — outlines don't reflow the grid, so the matrix doesn't shift when you click around
- `chap-tile.l3+` flips text color to the page background for contrast (dark tiles, light numerals)
- Stars use the same `--red` accent as the rating widget in `+ Book`, so the visual language is consistent

---

## Data shape notes

The view only consumes `scriptureReads` and `bookReads` from the existing parent state — no new fetches, no new tables, no schema changes. Build 1's data layer was already shaped for this; aggregation is a pure transform on top.

`dailyPages` is intentionally **not** consumed here. Daily-page logs don't have an author or a title (sometimes), so they don't fit the author rail or the book card. They show up in the heatmap and calendar (where they always have a date and a count), but the Book × Chapter view is for *titled* reading.

---

## Tests

8 new tests, 27 total in `dataAggregation.test.ts`. Coverage:

- `bucketChapterReads`: 0/negative/NaN → 0; the five thresholds; large values stay at 5
- `aggregateScriptureByBookChapter`: book grouping, read-count totals, per-chapter fraction summing with a real Luke 24 verse-range example, newest-first sort, defensive empty-string skip
- `aggregateBooksByAuthor`: case-sensitive grouping (preserves how Goodreads spells names), whitespace-only author → "Unknown author", page totals, newest-first sort

All 265 tests pass. Production build clean.

---

## What's next

- **Stats view** (next turn): KPIs, top-N bar, monthly columns, OT/NT donut, Years-in-Books retrospective
- **Build 3**: Reading Plans with multiple saved plans + completion tracking
- **Build 4**: Verification pass across all five views + capture surfaces
