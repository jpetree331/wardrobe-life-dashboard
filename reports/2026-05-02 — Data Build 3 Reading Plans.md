# Data — Build 3 (Reading Plans)

**Date:** 2026-05-02
**Files touched:** 4 changed
- `app/src/lib/data.ts` (add CRUD: create/update/delete plan, listAllPlanCompletions, togglePlanCompletion)
- `app/src/lib/dataAggregation.ts` (add 5 pure helpers for plan math)
- `app/src/pages/Data.tsx` (PlansView + PlanCard + PlanDetail + PlanCreateModal + presets)
- `app/src/pages/Data.css` (~250 lines for plan list, detail, modal)
- `app/test/dataAggregation.test.ts` (13 new tests)

The fifth and final tab. The Data room is now complete in scope.

---

## What you asked for

From the original scoping conversation, requirement #7:

> *"It would be nice to include a button for 'saved reading plans' so I could save more than one."*

So: multiple saved plans, separately tracked. This delivers exactly that — plus presets, pace tracking, per-chapter completion, and a clean "all plans" overview.

---

## Schema reuse

The schema for this was already in place from Build 1's migration `0005_data.sql`:

- `data_reading_plans` — name, books[], start_date, end_date, days_of_week[], unit, per_session
- `data_plan_completions` — per-(plan, book, chapter) row, with `unique (plan_id, book, chapter)` so toggling is idempotent

So Build 3 was a pure UI + write-side CRUD addition. No migration. No data layer rewrites.

The migration's comment is worth quoting because it's a design rule I honored:

> *"Reads here are SEPARATE from data_scripture_reads — completing a plan session does NOT log a Scripture read, and vice versa."*

Plans track plan progress. Scripture reads track lived study. They serve different purposes — a plan completion is a "checkbox tick", a Scripture read is "I sat down and read." Some people use both, some use only one. The two surfaces don't write into each other.

---

## Three screens

### 1. List view (the default landing)

Header: "Reading Plans" + "+ New plan" button.

If you have no plans yet, the empty state shows the four presets as big tappable cards (Bible in a Year · NT in 90 Days · Gospels in 30 · Psalms in a Month) — each opens the create modal pre-filled.

If you have plans, the body becomes a responsive grid (`auto-fit, minmax(280px, 1fr)`) of plan cards. Each card shows:

- **Name** (Cormorant 18px)
- **Pace pill** — `on pace` / `ahead by N` / `behind by N` — color-tinted (green ahead, warm-orange behind, neutral on-pace)
- **Date range + book count + chapter total** in the meta line
- **Progress bar** (6px slim version)
- **Foot row**: `X / Y chapters · Z%`

Click a card to drill into detail.

### 2. Detail view

Two panels stacked.

**Header panel** — Big plan name + pace pill, full meta (`start → end · N books · M chapters/session · day-of-week list`), an extra-large 12px progress bar, then a totals row:

> **35** of 89 chapters complete · expected by today: 33 · 39% done

So at a glance: what's done, what *should* be done, and the percentage. The "expected by today" number is the same value the pace pill is calculated from — it's there explicitly so you can see why you're shown as "ahead by 2" or "behind by 2".

**Chapters panel** — One row per book in the plan. Each row: book name (with `done/total` mini-counter underneath) on the left, then a chapter grid (`repeat(auto-fill, minmax(28px, 1fr))`) of small numbered tiles. Click a tile to toggle completion — server round-trip + state refresh — and the tile flips between empty (`bg-2`) and filled (`heat-5`). A `busy` class greys the tile during the server call so you can't double-click into a race.

Click "← all plans" to go back. "Delete plan" sits on the right with a confirmation prompt; the schema's `on delete cascade` removes completion history along with the plan.

### 3. Create / preset modal

Same `Modal` component used by + Scripture / + Book / + Daily pages. Form fields:

- **Preset strip at the top** — four chips (Bible in a Year, NT in 90, Gospels in 30, Psalms in a Month). Click one to pre-fill the entire form. You can still tweak any field after.
- **Name** — defaults to the preset name
- **Start / End date** — date pickers; presets compute these relative to `today` (e.g., "30 days from today")
- **Days of week** — seven toggle pills (Sun..Sat). Click to enable/disable. At least one required.
- **Chapters per session** — number input, 1..200
- **Books picker** — two columns (OT + NT) of checkboxes, with quick-action buttons above (`OT only` · `NT only` · `All 66` · `Clear`) and a live counter on the right (`N books · M chapters`)

Validation: name required, ≥1 book, ≥1 day, end ≥ start. Errors render under the form; the save button stays disabled while saving.

The submitted books array is filtered through `BIBLE_BOOKS` so it ends up in canonical Genesis→Revelation order regardless of click sequence — important because `planChapterSequence` walks `plan.books` in order, and the user's click order shouldn't matter to that.

---

## Pace math (the interesting part)

The pace logic lives in two helpers — `sessionsThroughDate` and `planPaceStatus`.

**Sessions through a date** — given a plan and an arbitrary date, count how many "session days" fall in `[start_date .. min(date, end_date)]`. A session day is a calendar day whose `getDay()` is in the plan's `days_of_week` set. So an M/W/F plan that started Monday Jan 5 and is asking about Friday Jan 9 gets 3 sessions (Jan 5, 7, 9).

**Pace status** — `expected = sessionsThroughDate(plan, today) × per_session`. `completed = min(completionsCount, total)` (capped so 99 completions don't read as "done +50"). The diff drives:

- `state` = `1` (ahead), `0` (on), or `-1` (behind)
- `sessionDelta` = `diff / per_session` — translates raw chapter count into "days you'd need to skip/double-up to catch up"
- `pctComplete` = `completed / total`

The pace pill rounds `sessionDelta` to nearest integer, so "ahead by 2" means roughly two normal sessions of buffer.

**DST-immune** — same lesson as the heatmap: all calendar arithmetic uses `formatLocalDate(d)` for keys and `d.setDate(d.getDate() + 1)` for advancement. No millisecond math, no DST drift.

---

## Helpers (5 new exports in `dataAggregation.ts`)

Each pure, generic over a `ReadingPlanLike` minimal type, callable from tests without React or Supabase:

1. **`planChapterSequence(plan, chapterCountFor)`** — ordered `[{book, chapter}, ...]` walking books in plan order, chapters 1→N within each. The detail view uses this to render the per-book grid; the toggle handler keys off `${book}|${chapter}`.

2. **`planTotalChapters(plan, chapterCountFor)`** — sum of chapter counts. Used for the progress bar denominator.

3. **`sessionsThroughDate(plan, dateKey)`** — calendar walk inside the plan's window, filtered by days-of-week. Returns 0 if the date is before `start_date`, caps at `end_date` if past.

4. **`planTotalSessions(plan)`** — `sessionsThroughDate(plan, plan.end_date)`. Sugar for "how many sessions does this plan have in total?"

5. **`planPaceStatus({plan, completionsCount, today, chapterCountFor})`** — the pace summary described above.

The `chapterCountFor` callback is injected so `dataAggregation.ts` doesn't depend on `bibleVerseCounts.ts` — the pattern from `otNtVerseSplit` (Build 2 Stats) and `aggregateScriptureByBookChapter` (Build 2 Book × Chapter). Calling it from the React layer is one line: `chapterCountFor: chapterCount`.

---

## CRUD additions in `data.ts`

Functions added:

- `createReadingPlan(input)` — full insert; `unit` defaults to `'chapters'`, `per_session` to `1`
- `updateReadingPlan(id, patch)` — partial update; not used by UI yet (no edit modal in this build) but available
- `deleteReadingPlan(id)` — cascade in schema removes completions
- `listAllPlanCompletions()` — bulk fetch (faster than fetching per-plan when rendering the list view; we group by `plan_id` in memory)
- `togglePlanCompletion(planId, book, chapter)` — atomic toggle: select existing, delete if found, insert if not. Returns `{ created: boolean }`.

The `togglePlanCompletion` could theoretically race if two clicks arrive ~simultaneously, but the schema has `unique (plan_id, book, chapter)` so the worst case is an insert error on the second click — UX-acceptable. The `busy` flag in the UI prevents this on a single client.

---

## Presets

Four built-in:

| Preset | Books | Window | Pace |
|---|---|---|---|
| Bible in a Year | All 66 | Jan 1 → Dec 31 of current year | Daily, 4 chapters |
| New Testament in 90 Days | NT (27) | today → today+89 | Daily, 3 chapters |
| Gospels in 30 Days | Matt/Mark/Luke/John | today → today+29 | Daily, 3 chapters |
| Psalms in a Month | Psalms | today → today+29 | Daily, 5 chapters |

Each is a `PlanPreset` object with a `build(today)` function. Adding a new preset is one entry in the `PLAN_PRESETS` array. They're shown in two places: as big cards in the empty state, and as chips at the top of the create modal.

The math actually works out in each case — Bible in a Year covers 1,189 chapters in 365 days at 4/day = 1,460 sessions worth of capacity (you'll finish early or take some days off). NT in 90 covers 260 chapters at 3/day = 270 sessions. Same for the others.

---

## Tests

13 new tests, 50 total in the dataAggregation file, **288 across the suite** (was 275 after Stats).

Coverage:

- `planChapterSequence` — book + chapter ordering, full sequence count
- `planTotalChapters` — sum, defensive zero for unknown books
- `sessionsThroughDate` — M/W/F filter inside a window, before-start returns 0, past-end caps at end_date, empty days-of-week returns 0
- `planTotalSessions` — full-window sum
- `planPaceStatus` — on-pace / ahead / behind, `min(completed, total)` cap, per_session > 1 math

---

## Verification

- TypeScript: clean
- 288 tests pass
- Production build: clean (1,008 KB / 312 KB gzipped — up ~12 KB/4 KB from Stats, modest growth for a new view + modal)

---

## What this completes

The Data room now has all five tabs live:

| Tab | Status | What it does |
|---|---|---|
| Heatmap | live | "When did I read this year?" — yearly grid, 6 themes |
| Calendar | live | Month-grid view with cross-room markers |
| Book × Chapter | live | "Where in the canon have I been?" — book rail + chapter matrix + reads pane |
| Stats | live | "What's the shape of my year?" — KPIs, monthly, OT/NT, top-N, retro |
| Plans | live | "Save and track multiple reading plans" |

That's the full Data room scope. Build 4 is the verification pass.

---

## What I deferred / didn't do

A few things I explicitly chose not to ship in this build to keep the diff focused:

1. **Edit existing plan** — the `updateReadingPlan` API is in place but there's no edit UI. You can delete + recreate for now. Easy to add an edit modal later that reuses `PlanCreateModal` with initial values.

2. **Plan completion timestamps in the UI** — `completed_at` is stored, but the chapter tiles don't show *when* you completed them. A hover tooltip would be a small follow-up.

3. **Verses-mode plans** — the schema supports `unit: 'verses'`, but the UI hard-codes chapters. Verse-level plans are rare and would complicate the chapter-grid metaphor; leaving for a future feature.

4. **Plan import / export** — share a plan with someone, import a friend's plan as JSON. Out of scope for this build.

5. **Calendar integration** — plan sessions don't currently show up as markers on the Calendar view. Could be a Build 4 nicety if you want it.

---

## What's next

**Build 4** — the verification pass. I'll go through every Data view (Heatmap, Calendar, Book × Chapter, Stats, Plans), each capture surface (+ Scripture, + Book, + Daily pages, + Reading plan), and the cross-room integration (Sanctuary `scripture_refs` flowing through). Look for: dead code, edge cases, mobile layout regressions, accessibility issues, copy that needs polish, and anything that doesn't quite feel right.
