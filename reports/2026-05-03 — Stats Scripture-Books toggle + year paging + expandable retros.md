# Stats Scripture/Books toggle + year-rail paging + expandable retrospectives

**Date:** 2026-05-03
**Files touched:** 4
- `app/src/lib/dataAggregation.ts` (added `topAuthorsByCount`, `daysWithReadingByYear`)
- `app/src/pages/Data.tsx` (Stats restructure: mode toggle, new helper components)
- `app/src/pages/Data.css` (chevrons, stats-controls, expandable retro bars, recent finished)
- `app/test/dataAggregation.test.ts` (8 new tests)

Three issues you flagged, all fixed in one commit because they touch overlapping code.

---

## 1. Scripture / Books toggle on the Stats page

A Pillbar in the top-right of the Stats page now scopes everything below it. The whole page reshapes when you flip the toggle:

**Scripture mode:**
- KPIs: Reading days · Verses · Distinct chapters · Longest streak
- Top books read (most-read Bible books by verses, this year)
- By month (verses)
- Old / New Testament donut
- **Years in Scripture** retrospective (NEW — see #3)

**Books mode:**
- KPIs: Books finished · Pages · Authors · Reading days
- Top authors (by books finished this year)
- Recently finished (last 6 books finished in the year, with stars and dates)
- By month (pages)
- **Years in Books** retrospective (the old one, redesigned per your screenshot)

The donut and Bible-books bar are Scripture-only (they don't have meaningful Books-mode equivalents). The Years-in-Books retrospective is Books-only — Scripture mode gets its own parallel **Years in Scripture** section instead, per your "Q1 = (b)" answer.

The mode lives in component state, so navigating between tabs doesn't reset it.

### Internally

The page is now split into three components:
- `StatsView` — owns the mode + year state, computes the year stats once, dispatches to the right child
- `ScriptureStats` — Scripture-mode body (KPIs, top books, monthly, donut, Years in Scripture)
- `BooksStats` — Books-mode body (KPIs, top authors, recently finished, monthly, Years in Books)

`computeYearStats` already returns `{ scripture, books, combined }` sub-objects from the earlier work, so each mode just plucks the slice it cares about. No new aggregation work for the KPIs.

---

## 2. Year rail can now page through history

The year rail (used by Heatmap and Stats) was hard-coded to "last 5 years," so anything older than 2022 was unreachable — including most of your Goodreads import. Fixed per your "Q3 = (a)" answer.

**Layout:**
```
[‹]  2022 (45)  2023 (123)  2024 (89)  2025 (203)  2026 (45)  [›]
```

(For the Heatmap's vertical rail it's `▴ … ▾` instead of `‹ … ›`, with the chevrons stacked top/bottom.)

**Behavior:**
- Click `‹` → window shifts 5 years back (now showing 2017–2021)
- Click `‹` again → 2012–2016. Etc.
- Click `›` → forward.
- Both chevrons disable at boundaries: `‹` greys out when you've reached the earliest year that has data; `›` greys out at the current year.
- The window auto-shifts if you select a year outside it via some other path (e.g., clicking a row in the retrospective that's far in the past) — paging state stays in sync with the active year.
- Each year shows a small `(N)` count in monospace beneath/beside it. Per your "Q4 = days for all that are lit up" answer, **N = distinct days with any reading that year** — unified across both Heatmap and Stats so paging back through history feels uniform. Years with zero reading show a `·` placeholder and the button gets a dashed border so it's visually distinct.

**Internally:**
- Added `daysWithReadingByYear({ scriptureReads, bookReads, dailyPages })` to `dataAggregation.ts` — returns a `Map<year, number>` of distinct days. Pure function, two unit tests covering cross-source dedupe and empty inputs.
- The `YearRail` component now accepts `counts` and `dataYears` props and manages its own window state internally. The chevron paging boundaries are derived from `dataYears` (the years where the user has any reading data), so I won't let you page back into 1999 just to find empty years.

---

## 3. Years-in-X retrospectives are now expandable

The old retrospective was a flat table where clicking a row only changed the active year — nothing actually opened. Replaced both modes with bigger horizontal bars, redesigned per your screenshot. The bars are colored, fill proportionally to the year with the highest count in the visible set, and click to expand.

### Years in Books (Books mode)

Each year row:
```
2026  [ 6 ████████████████████ ]                         ▾
       ┌────────────────────────────────────────────────┐
       │ ★★★★★  A Severe Mercy · Vanauken               │
       │         Surprised by Joy · Lewis                │
       │         Gilead · Robinson                       │
       │         The Diary of a Country Priest · Bernanos│
       │ ────────────────────────────────────────────────│
       │ ★★★★☆  Holy the Firm · Dillard                 │
       │         The Cloud of Unknowing · Anonymous      │
       │ ────────────────────────────────────────────────│
       │ BOOKS  PAGES  DAYS  LONGEST           SHORTEST  │
       │   6    1,243   N    The Diary…304pp   Holy the Firm…80pp │
       └────────────────────────────────────────────────┘
2025  [ 11 ████████████████████████████████ ]            ▸
2024  [ 9  ███████████████████████ ]                     ▸
…
```

- The bar's fill represents that year's book count, scaled against the largest in the list.
- Books inside the expanded panel are grouped by star rating (5★, 4★, 3★, …, then unrated last). Each book shows as a small chip with title (italic) and last-name of the author (dim), so the row stays scannable.
- Footer stats: Books · Pages · Days · Longest book (title + page count) · Shortest book (title + page count).
- The active year auto-expands by default — instant continuity with the rest of the page.
- A chevron `▸ / ▾` toggles. Empty years (count = 0) show a `·` and aren't clickable.

### Years in Scripture (Scripture mode, NEW)

Same bar/chevron pattern, different content. The bar shows chapter-read count for that year. Expanded:

- A "Top books read" mini bar chart for that specific year (mirrors the Top Books panel above, but year-scoped). So you can see "in 2024 I read mostly Psalms (340 verses), Isaiah (220), John (180)…"
- Footer stats: Verses · Chapter reads · Days.

Per your "Q2 — Scripture mode = my recommendation" answer.

### Internally

Two components — `YearsInBooks` and `YearsInScripture` — share styling via a single `.yib-*` CSS namespace but have different children. Each has its own row component (`YearsInBooksRow`, `YearsInScriptureRow`) so the expansion logic can be specialized without conditional spaghetti. The shared animation, the bar geometry, and the chevron toggle are all in CSS — no JS animation needed.

The Books rows lookup books-per-year via a `Map<year, BookRead[]>` built once with `useMemo`, so expanding any row is O(1). Top-books-by-year inside `YearsInScriptureRow` is computed lazily — only when the row is expanded — to avoid running the topBooksByVerses pass for every collapsed year on every render.

---

## What I deliberately didn't do

- **A side-pane showing Longest/Shortest** like in your design ref. I integrated those into the row's footer stats instead — saves the horizontal real estate and keeps the layout simpler. If the inline version doesn't read as well, easy to break out a side pane.
- **Hide the "details" word entirely**, replaced with a clean `▸` / `▾` chevron per your "an arrow that shows expansion is fine" note.
- **Per-book click-through** inside the expanded panel. Books are chips today — informational only. Could later make them clickable to open the edit modal we built last turn, but that's a separate decision (do you want clicks here to navigate, or to edit?).
- **Animation on expand**. Native CSS height transitions on auto-height containers don't work cleanly; I'd need a library or `grid-template-rows: 0fr → 1fr` trick. The chevron flip is the only motion right now. Can add real height animation later if it feels abrupt.
- **Migrate the Heatmap's heat-grid to also use the same paging window state.** It already does, since both rails go through the same `<YearRail>` component now — both got chevrons + counts in this commit.

---

## Verification

| Check | Result |
|---|---|
| TypeScript compile | clean |
| Test suite | **321 / 321 passing** (5 new for `topAuthorsByCount` + `daysWithReadingByYear`) |
| Production build | clean (1,027 KB / 317 KB gzipped — +10KB JS / +1KB gz for the new components) |

I also walked through the page logic mentally:
- Mode toggle: state lives in `StatsView`, gets passed to children, doesn't leak across tab switches ✓
- Year rail: window state lives in `YearRail`, syncs with the active `value` via `useEffect` so clicking a Years-in-X row in the retrospective auto-pages the rail ✓
- Empty states: Top Authors / Recently Finished / OT-NT donut all have empty-state messages for years with no data ✓
- Active-year auto-expand: `useEffect([activeYear])` resets `expandedYear` to the new active year, so the right row is always open ✓
