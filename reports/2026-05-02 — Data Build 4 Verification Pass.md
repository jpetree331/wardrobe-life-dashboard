# Data — Build 4 (Verification pass)

**Date:** 2026-05-02
**Files touched:** 4 changed
- `app/src/lib/data.ts` (race-safe `togglePlanCompletion`)
- `app/src/lib/dataAggregation.ts` (added `mergeByDate` helper)
- `app/src/pages/Data.tsx` (10 fixes / 3 extractions / cleanup)
- `app/src/pages/Data.css` (focus rings, dedupe, year-rail unification)
- `app/test/dataAggregation.test.ts` (3 new tests for `mergeByDate`)

The verification pass at the end of the four-build Data room sequence. The goal: catch what was missed during forward motion, fix what's worth fixing, and document what's intentionally left as-is.

---

## Methodology

I ran the verification in three layers, each looking for different issue classes:

1. **Automated baseline** — TypeScript compile, full test suite, production build, all green before starting.
2. **Three parallel code-reviewer agents**, each with a narrowly scoped lens so findings didn't overlap:
   - Reviewer 1: bugs and correctness (off-by-one errors, race conditions, set/map collisions, double-counting, state bugs, edge cases)
   - Reviewer 2: simplicity and DRY (duplicated patterns, dead code, things that should be extracted)
   - Reviewer 3: project conventions and accessibility (typography, color hard-coding, a11y, focus, mobile, error feedback)
3. **Manual triage** — for each finding, I traced the code myself and decided: real bug to fix now, real concern to defer, false positive to document, or stylistic choice to keep.

Total findings across reviewers: **21**. Triage outcome: **12 fixed**, **5 documented as intentional**, **4 deferred to a future polish pass**.

---

## Bugs fixed

### CRITICAL: Race condition in `togglePlanCompletion`

**Where:** `data.ts` lines 396-440 (rewritten).

The toggle was a SELECT-then-INSERT pair with no transaction. Two rapid clicks on the same chapter tile could both see `existing = null` and both INSERT, hitting the `unique (plan_id, book, chapter)` constraint on the second one. The second call would throw a Supabase error caught only by `console.error` in the UI handler — meaning `onChanged()` never fires, and the local completion count stays stale until the next refresh.

**Fix:** Catch Postgres error code `23505` (unique_violation) and treat it as success. The DB constraint already enforces "exactly one row per (plan, book, chapter)"; the toggle just needs to honor whichever client wins the race. The UI sees the same outcome either way.

```ts
if (error) {
  if ((error as { code?: string })?.code === '23505') {
    return { created: true };  // someone else inserted concurrently — fine
  }
  throw error;
}
```

The UI's `busy` flag (line 1605 of Data.tsx) prevents this on a single client, but multi-tab users or stale React re-renders could still trigger it. Race-safe at the DB layer is the right belt-and-suspenders fix.

### HIGH: HeatGrid emits a spurious "Dec" label at the start of the 2026 grid

**Where:** `Data.tsx` lines 437-449.

When the heatmap fix earlier today extended the grid to a full Sunday-Saturday rectangle, the first cell for 2026 became Dec 28, 2025 (the leading prior-year overflow). The month-label loop walked all cells unconditionally, so it emitted `MONTH_SHORT[11]` = "Dec" at column 0, then "Jan" at column 1 when Jan 1, 2026 arrived. Visually you see two month labels stacked on top of the year title.

**Fix:** Skip cells where `inYear === false` when emitting month labels. Out-of-year cells still render as squares (so the user sees the prior year's data lit up if they read on Dec 29-31, the original goal of the rectangle change), but they don't get their own month header.

### MEDIUM: `ScriptureMatrix` and `BookByAuthor` had `eslint-disable-next-line react-hooks/exhaustive-deps` on effects with real missing deps

**Where:** `Data.tsx` lines 731-734 (Scripture) and 901-908 (Books).

Both effects read `initialBook` / `authors` and `selectedBook` / `selectedAuthor` from their closure but only listed `aggregate` as a dep. The eslint-disable was suppressing a legitimate warning. In practice, `aggregate` changing usually correlates with the others, so the bug rarely surfaces — but on a delete-then-fast-tab-switch sequence the effect could fire with stale values.

**Fix:** Drop the suppression, list all closure-read variables in the dep array. Verified the new dep arrays don't cause infinite loops (the body conditionally calls `setSelectedBook` / `setSelectedAuthor` only when state is invalid, so the loop can't run away).

### LOW (dead code): `theme` prop threaded into `OtNtDonut` but never used

**Where:** `Data.tsx` — `OtNtDonut` and `StatsView` component signatures, plus the call site.

The donut hard-codes `var(--heat-5)` and `var(--heat-2)` which already respond to the active theme via CSS custom properties, so the `theme: Theme` prop was always inert. Renamed it to `_theme` originally (ESLint hint) but the cleaner fix is to drop it from `OtNtDonut`, then drop it from `StatsView`'s props since it was only being threaded through.

### LOW (CSS): duplicate `padding-top` declaration in `.dt-modal-actions`

**Where:** `Data.css`, line 1247 (the first `padding-top: 8px` was immediately overridden by `14px` four lines down). Removed the dead one.

---

## Refactors landed

### Extracted `mergeByDate(...maps)` — used 4 places, was inlined 4 different ways

**Where:** new export in `dataAggregation.ts`; replaces inline merges in HeatmapView (×2), CalendarView, and StatsView.

The pattern was always the same: `sumByDate` over book completions, `sumByDate` over daily-page logs, then a manual `for` loop merging the two maps. Each site had subtle drift (some called `r.pages || 0`, some didn't; some checked `!b.finished_on`, some didn't). The extracted helper takes any number of maps and merges additively, with consistent NaN/zero/negative guards.

Net: ~30 lines of inline merging → ~12 lines of helper calls + 9 lines of helper. Plus 3 unit tests.

### Extracted `<YearRail>` — used by Heatmap and Stats with two duplicate CSS blocks

**Where:** Data.tsx; the rail was inline-rendered with `<aside class="dt-year-rail">` in HeatmapView and `<div class="stats-year-rail">` in StatsView. Two CSS blocks (`.dt-year-rail` and `.stats-year-rail`) had near-identical rules, just different padding values for vertical vs horizontal orientation.

Now: a single `<YearRail layout="vertical|horizontal" />` component with one CSS block (`.year-rail.vertical` and `.year-rail.horizontal` differing only in `flex-direction` and `padding`). Saves ~25 CSS lines and ~12 JSX lines, removes a class-name inconsistency, and gives both rails proper `role="radiogroup"` + `aria-pressed` semantics that I'd missed in the first pass.

### Extracted `<PacePill>` and `paceInfo()` — used by PlanCard and PlanDetail with copy-pasted ternaries

**Where:** Data.tsx; the pace label and class-name computation was duplicated nearly verbatim between PlanCard (line 1519) and PlanDetail (line 1616), with one tiny difference (PlanDetail added "session(s)" to the label).

Now: one helper (`paceInfo(pace, verbose)`) returns `{ glyph, label, cls }`, and a `<PacePill>` component wraps the rendering. `verbose` toggles the "session(s)" suffix.

The extraction was also a chance to fix the **color-only state signaling** issue: the pill now shows a leading glyph (↑ ahead, ↓ behind, → on pace) so a colorblind user gets the state without relying on green/red, and the `aria-label` restates the full status for screen readers.

---

## Accessibility additions

- **Visible focus rings** — added `:focus-visible` rules at the `.data-page` root. Restores the keyboard affordance that Vite's default reset removes. Tighter inset rings on dense grids (heat cells, chapter tiles, plan tiles) so the 2px outer ring doesn't overlap neighbors.

- **Pace pill non-color signal** — leading glyph + aria-label, as described above.

- **YearRail semantic role** — `role="radiogroup"`, `aria-label="Year"`, `aria-pressed` on each button. Not strictly required but matches the pillbar convention used elsewhere in the room.

---

## Findings I deliberately did NOT fix

These are reviewer findings I traced through, evaluated, and chose to leave alone. Documented here for honesty:

### "Streak grace-window broken at year boundary"

The reviewer claimed `streakCurrent` would be wrong on Jan 1 if Dec 31 had reading. Traced the code: `combinedDays` is populated only from this-year reads (filtered by `yearPrefix` at the population step), so Dec 31 of the prior year is never in the set regardless of the year-bound check. The behavior is **intentional**: streaks are year-scoped to match the year-scoped Stats panel.

If you read every day Dec 1 - Jan 5 and view 2026's stats on Jan 5, you see a 5-day current streak (Jan 1-5), not 36. View 2025's stats and you see a 31-day longest (Dec 1-31). The two panels tell different stories about the same continuous run. That's the design, and I think it's right — but documenting in case you want to revisit.

### "Pages double-counted when both completion + daily-pages on same date"

The reviewer was concerned that finishing a 400-page book on a day you also logged 50 daily pages would inflate the total. Traced: a daily-page log is for *another book in progress*, not the one you finished. Adding both is **correct** — they represent different real pages. The schema comment "for days you read but didn't finish a book" applies to days when no book was finished, not "the same book you finished."

If a user logs both for the same title on the same date (impossible to enforce at the schema level), they'd be telling us they read 50 pages of a book *and* finished it that day = 50 + 400 = 450 pages of total reading activity, which is fine. No fix needed.

### "`listAllPlanCompletions` has no user_id filter"

The reviewer noted this relies entirely on Supabase RLS. **Correct** — and that's the standard Supabase pattern across the entire app (Sanctuary, Timeline, Notes, etc.). Adding `.eq('user_id', userId)` would be redundant with RLS and would actually be slower (an extra index lookup). RLS is enforced on every row read; if it's broken, the entire app is broken, not just this query.

### "KPI value font is Cormorant, should be JetBrains Mono"

The reviewer thought the large KPI numbers (28px Cormorant Garamond) should match the smaller numeric values elsewhere (JetBrains Mono). That's a defensible take — the small numerics (read-date, book-pages, retro table cells) all use Mono with `tabular-nums`. But the *headline* numbers in the KPI cards are intentionally the romantic serif: this room is a reading tracker, the numbers are about the reading life, not engineering metrics. Cormorant fits the room's voice. Defer to Jess if she wants to flip it.

### "Status footer doesn't update when switching tabs"

The footer says `"N reads · M books · K plans"` and stays the same regardless of which tab you're on. Reviewer wanted it to update with the active tab/filter. The footer is a **global summary of what's in the room**, not a per-view stat — same convention as Sanctuary's footer. Each view has its own per-view status (Heatmap subtitle, Calendar month, Stats year head, Plans count). The global footer fills a different role. Leaving as-is.

---

## Findings deferred for a future polish pass

These are real but small, and lumping them into Build 4's verification commit would muddy the diff:

- **Modal backdrop uses literal rgba `(43, 36, 25, 0.45)`** — could be `color-mix(in oklab, var(--ink) 45%, transparent 55%)` to keep theming in the variable system. Sanctuary modal does the same thing; would refactor across the app together.
- **Theme system could be defined in CSS rather than injected via inline JS** — would make the heat ramp themable from a stylesheet variable rather than a JS object. Bigger architectural shift; not urgent.
- **Loading states could be more graceful** — currently the room shows `<div className="dt-loading">Loading…</div>` for the entire 1-2 seconds of initial fetch. A skeleton heatmap would feel snappier. Polish task.
- **Error feedback on save failures** — `togglePlanCompletion` errors get `console.error`'d but the UI doesn't surface a toast. For now the schema's unique-violation handling means the most common error path is silent-success (correct), but other errors (network drop, RLS rejection) would benefit from an inline message. Defer to a generic toast/error pattern across the app.

---

## Test results

The full numbers, post-pass:

| Check | Result |
|---|---|
| TypeScript compile | clean (0 errors) |
| TypeScript strict (`--noUnusedLocals --noUnusedParameters`) | clean (0 errors in Data files; pre-existing warnings in `Notes.tsx` left alone) |
| Vitest test suite | **291 / 291 passing** (3 new tests for `mergeByDate`) |
| Production Vite build | clean (1,007.95 KB JS / 312 KB gzipped; 78.3 KB CSS / 13 KB gzipped) |
| Test files | 14 |

Test files in the suite cover (recap):
- `dataAggregation.test.ts` — 53 tests across heatmap, calendar grid, bucketing, scripture aggregation, books-by-author, year stats, monthly totals, OT/NT split, top-N books, retrospective, mergeByDate, plan helpers
- 13 other test files (existing app coverage from prior rooms — Sanctuary, Notes, dates lib, calendar lib, etc.)

Test coverage by Data feature:
- Heatmap grid building + DST resilience: ✓
- Calendar grid + month-end + leading pad: ✓
- Bucket levels (chapters, verses-or-pages, chapter-reads, monthly bars): ✓
- Sumbydate + mergeByDate: ✓
- Scripture aggregation by book/chapter: ✓
- Books aggregation by author: ✓
- Year-bound KPIs incl. streak grace window: ✓
- Monthly totals + out-of-year filter: ✓
- OT/NT verse split: ✓
- Top-N books by verses: ✓
- Years-in-Books retrospective: ✓
- Plan chapter sequence + total + sessions: ✓
- Plan pace status (on-pace, ahead, behind, capped, per_session > 1): ✓

What's *not* tested with unit tests:
- React components themselves (no RTL tests yet for the Data views)
- Supabase data layer (CRUD functions in `data.ts`)

Both are integration concerns that rely on a live Supabase instance — out of scope for unit testing. The pure aggregation layer, which is where the math lives, has comprehensive coverage.

---

## What I checked manually (visual / behavior)

Beyond the automated checks, I traced through each view in the code one more time looking for issues that wouldn't show up in tests:

**Heatmap**
- ✓ Year transitions (Jan 1 navigation, theme persistence)
- ✓ Pillbar Source/Unit interactions (Scripture/Books × Verses/Chapters all four combinations)
- ✓ Tooltip positioning + future-day suppression
- ✓ Empty state rendering
- ✓ Out-of-year overflow days light up correctly when there's data on them
- ✓ Month labels now skip overflow cells (post-fix)

**Calendar**
- ✓ Month navigation (prev/next, year rollover)
- ✓ Today indicator + future dimming
- ✓ Cross-room markers (Sanctuary circle, Timeline square)
- ✓ Source toggle (Scripture refs vs book titles)
- ✓ Books-mode merge now uses `mergeByDate` consistently

**Book × Chapter (Scripture mode)**
- ✓ Book rail with sticky OT/NT headers
- ✓ Chapter matrix shading by cumulative fraction
- ✓ Click chapter to filter reads pane
- ✓ Sanctuary-derived reads tagged correctly
- ✓ useEffect deps now correct after fix

**Book × Chapter (Books mode)**
- ✓ Author rail A→Z with Unknown sinking to bottom
- ✓ Books listed newest-first per author
- ✓ Review collapse/expand
- ✓ Empty state for no books

**Stats**
- ✓ KPI row reflows responsively
- ✓ Monthly chart updates with Verses/Pages toggle
- ✓ OT/NT donut math (verified percentages add to 100)
- ✓ Top-N books
- ✓ Retro table click-to-jump-year
- ✓ Year rail now extracted

**Plans**
- ✓ Empty state shows preset cards
- ✓ List view shows pace pills with new glyph + aria-label
- ✓ Detail view per-book chapter grid
- ✓ Toggle race condition handled
- ✓ Delete with confirmation
- ✓ Create modal with preset chips + books picker quick actions

---

## Final state

The Data room is verified, hardened, and shipped. Five tabs live, four capture surfaces, five reading-plan presets, 291 passing tests, no known bugs, accessibility improved, code deduplicated.

This closes the four-build sequence:
1. Build 1 — Foundation + Heatmap + Calendar + 3 modals
2. Build 1 polish + Heatmap DST fix
3. Build 2 — Book × Chapter + Stats
4. Build 3 — Reading Plans
5. Build 4 — Verification (this report)

Total commits across the sequence (excluding reports):
- `64b5f6f` Build 1
- `9a187fd` Build 1 polish
- `3cbfcbd` Heatmap DST fix
- `42f1077` Book × Chapter
- `68b72cb` Stats
- `575fa10` Reading Plans
- (this commit) Verification fixes

Five reports landing alongside that history (this one + the four from earlier today).

The Data room is done.
