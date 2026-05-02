# Heatmap fix — DST "missing teeth" + leading-week symmetry

**Commit:** `3cbfcbd`
**Date:** 2026-05-02
**Files touched:** 3 changed, 132 insertions, 43 deletions
- `app/src/lib/dataAggregation.ts`
- `app/src/pages/Data.tsx`
- `app/test/dataAggregation.test.ts`

---

## What you reported

Two things in your screenshots:

1. **"Missing teeth"** — squares vanishing from the heatmap. Specifically:
   - Apr 26 2026 was missing
   - A day near Nov 2025 was missing
2. **Asymmetric left edge** — the 2026 grid started ragged on Sunday because Jan 1 2026 falls on a Thursday, so the first column had four empty cells stacked above Jan 1. You wanted those filled with the trailing days of 2025 instead of left blank for aesthetics.

Both real bugs. Here's what I found and changed.

---

## Bug 1: DST drift in `weekIndex`

### Root cause

`buildHeatGrid` was computing each cell's column index with millisecond arithmetic:

```ts
const weekIndex = Math.floor((d - firstSunday) / (7 * 24 * 60 * 60 * 1000));
```

That looks innocent, but it's quietly broken twice a year. **Spring-forward** drops one hour from the calendar (2 AM → 3 AM). So a date that should be exactly N weeks after `firstSunday` actually measures `N × 7 days − 1 hour` worth of milliseconds. `Math.floor` rounds that down to `N − 1`. That date now lands in the *previous* week column — colliding with whatever real day already lives at `(weekIndex=N−1, dow=same)`.

In CSS Grid, when two children specify the same `gridColumn` / `gridRow`, they stack. One paints over the other. From a user's perspective: a tooth disappears.

The same thing happens in reverse around **fall-back** (Nov 1 in 2026). Different sign, same collision class.

For 2026 with `firstGridSunday = Dec 28 2025`, the casualty was Apr 26 (collided with Apr 19's column). Earlier years had different victims depending on which dates landed exactly on a 7-day boundary across the DST transition.

### Fix

Switch to a calendar-only counter. No clocks involved:

```ts
let dayIndex = 0;
for (
  const d = new Date(firstGridSunday);
  d <= lastGridSaturday;
  d.setDate(d.getDate() + 1)
) {
  const weekIndex = Math.floor(dayIndex / 7);
  // ... push cell ...
  dayIndex++;
}
```

`d.setDate(d.getDate() + 1)` is calendar-correct in all timezones — it adds one calendar day regardless of whether DST shifted that day's clock. And `dayIndex` is just an integer counter; it can't drift.

### Regression tests

Three new tests pin this shut so it can't come back:

1. **Uniqueness** — every `(weekIndex, dow)` slot in the 2026 grid is unique (no two cells claiming the same square)
2. **Apr 26 2026** — sits in `apr19.weekIndex + 1` (spring-forward regression)
3. **Nov 8 2026** — sits in `nov1.weekIndex + 1` (fall-back regression)

Plus a year-boundary alignment check across 2024–2028 to catch drift in either direction.

---

## Bug 2: Asymmetric leading edge

### Root cause

The grid started at Jan 1 of the year and rendered exactly 365/366 cells. Years where Jan 1 isn't a Sunday left a notch in the top-left corner — the cells above Jan 1 were just absent. Visually unpleasant; you specifically called this out as wanting the prior year's tail to fill in.

### Fix

Render the **full Sunday-to-Saturday rectangle** that contains [Jan 1 .. Dec 31]:

```ts
// First Sunday on or before Jan 1
const firstGridSunday = new Date(yearStart);
firstGridSunday.setDate(yearStart.getDate() - yearStart.getDay());

// Last Saturday on or after Dec 31
const lastGridSaturday = new Date(yearEnd);
lastGridSaturday.setDate(yearEnd.getDate() + (6 - yearEnd.getDay()));
```

For 2026 that gives 4 leading pad days (Sun Dec 28 – Wed Dec 31, 2025) and 2 trailing pad days (Fri Jan 1 – Sat Jan 2, 2027). Total: 4 + 365 + 2 = 371 cells.

Each cell now carries `inYear: boolean`. Out-of-year cells render normally (real reads still light up — you'd want Dec 31 reads visible on the 2026 grid even though they technically belong to 2025, since they're sitting where you'd look for them). The renderer dims out-of-year cells slightly via the same `inYear` flag.

The header totals (`totalDays`, `totalCount` shown in the panel subtitle) only count `inYear && !isFuture && count > 0` days — so the "X verses across Y days" stat stays year-bounded regardless of overflow.

### Side effect: byDate scope

`HeatmapView`'s `byDate` memo used to filter reads by year, since the grid was year-bounded. With the rectangle now extending into prior/next years, that filter would have left overflow cells permanently empty. Removed the year filter — `byDate` now spans all years, and `buildHeatGrid` selects what to count via the `inYear` flag.

Net: 2 fewer `useMemo` deps, less work, more correct.

---

## Verification

- 257 tests pass (5 new in this fix)
- TypeScript: clean
- Production build: clean (985 KB / 306 KB gzipped — unchanged)

---

## What I checked for similar issues

I scanned the rest of `dataAggregation.ts` and `Data.tsx` for anything else doing date arithmetic via subtraction:

- `buildCalendarGrid` — uses `getDay()` and a simple loop, no millisecond math. Safe.
- `formatLocalDate` — uses local component getters (`getFullYear`/`getMonth`/`getDate`). Safe.
- `sumByDate` — operates on string keys only. Safe.
- The Bible-ref parser, scripture-read aggregation, etc. — no date math at all.

The DST hazard was specific to the heatmap's column-index calc. No other site at risk.

---

## What this means for the data

Your existing reads are unaffected — the database stores `read_date` as `YYYY-MM-DD` strings (no UTC drift), and `formatLocalDate` keeps it that way. The bug was purely in how the heatmap *positioned* cells on screen. Reload after this push and Apr 26 2026, Nov 8 2025, and any other DST-adjacent days that vanished will reappear in their correct columns.
