# Daybook — Build 3 (recurrence + Week + Month)

**Date:** 2026-05-24
**Files added:** 2
- `app/src/lib/daybookRecurrence.ts` — pure helper that expands recurring masters into phantom instances over a date range
- `app/test/daybookRecurrence.test.ts` — 8 unit tests covering daily, weekly, weekdays, range edges, master-day exclusion, multi-master, duration preservation

**Files modified:** 2
- `app/src/lib/daybook.ts` — added `DaybookBlockInstance` type, `listRecurringMasters`, `startOfWeek` / `endOfWeek` / `startOfMonth` / `endOfMonth` / `localWeekRangeIso` / `localMonthRangeIso`
- `app/src/pages/Daybook.tsx` — view-mode state, materialized-instance pipeline, phantom-aware edit routing, functional Day / Week / Month tabs, `WeekView` + `WeekColumn` + `MonthView` components, `addDays`, `formatRangeHeading`, `compactTime` helpers
- `app/src/pages/Daybook.css` — `.db-block.phantom`, `.db-block-phantom-mark`, `.db-block.compact`, `.db-week-*`, `.db-month-*` rules

Build 2 made the Day canvas feel like a real scheduler. Build 3 expands the room to a full calendar: a recurring block stored once shows on every matching day, the Week tab gives a 7-column at-a-glance, and the Month tab gives a 7×6 bird's-eye.

---

## What shipped

### Recurrence materialization

A block stored with `recur: 'daily' | 'weekdays' | 'weekly'` now appears on every matching day inside the current view, not just its anchor date. The masters live once in the database; **phantoms** are synthesized at render time.

The pure helper `expandRecurringInstances(masters, rangeStartIso, rangeEndIso)` walks the range day-by-day in local time, combines each cursor day with the master's time-of-day, and emits an instance if the pattern matches. The master's own date is excluded (it's already rendered as a real block by `listBlocksForRange`).

**Phantom marker** — recurring instances render with a dashed border instead of solid, and a tiny `↻` glyph appears before the title. The tooltip says "Recurring · double-click to edit all occurrences" instead of the usual "Double-click to edit."

**Editing a phantom routes to the master.** The phantom's id is synthetic (`master_id:YYYY-MM-DD`) and carries `_master_id` so the click handler can look up the real block and open the editor in edit mode. Changes propagate to every occurrence at the next refresh. (Per-occurrence overrides are deliberately deferred — they need a separate `daybook_block_overrides` table and an exception-shadow lookup at expand-time. Not a Build 3 feature.)

**DST-immune calendar arithmetic.** No millisecond math across dates anywhere — same lesson as the Data-room heatmap. Day cursors use `setDate(getDate() + 1)`, same-date checks compare year/month/day fields, time-of-day is set with `setHours()`. The 8 unit tests all run in local time exactly like the page does.

### Week view

A Sunday-anchored 7-column grid with the same time gutter as Day view. Each column is its own canvas with its own drag-to-create state, so dragging in Tuesday's column creates a Tuesday block — not a block at whatever `selectedDate` happens to be.

- **Sticky header row** — DOW (uppercase mono) + day-of-month (Newsreader 20px). Today's column gets `--margin` color on both. Click a header → switch to Day view on that date.
- **Today tint** — a faint warm `color-mix(--cat-health 6%, --paper 94%)` background-color shows through the gradient hour rules without disturbing them.
- **Compact blocks** — `.db-block.compact` pulls left/right insets in from 8/12px to 3/3px, drops the title to 12.5px and the time to 9.5px, hides the category badge. The hover tooltip still fires and shows the full info.
- **Shared tooltip** at the view level — one tooltip element managed by `WeekView` with `showTooltip` / `hideTooltip` callbacks passed down to each `WeekColumn`. Avoids 7 separate tooltip portals fighting each other.
- **Scroll handling** — the scroller starts at ~6:30 AM same as Day view, and scrolling cancels the tooltip (cached anchor rect would be stale).

### Month view

A 7×6 grid with day-of-week headers across the top, scoped to the calendar month but **visible grid is the date range** — spilled days from prev/next month show muted but functional, with their blocks pulled from the same materialization pass.

- **Day cell** — day-of-month number in the corner. Today gets a filled red pill. Out-of-month cells are slightly desaturated.
- **Block pills** — up to 3 per day, sorted by start time. Each pill: small mono time prefix ("8a", "12:30p"), title in 10.5px Work Sans, color-tinted background + left border in the category color. Phantoms get a dashed left border.
- **"+N more"** footer when there are >3 blocks. (Clicking through opens that day in Day view, where you can see them all.)
- **Click a cell** → switch to Day view for that date. The hand-off is one line: `setSelectedDate(d); setViewMode('day');`.

### Functional view tabs

The Day / Week / Month tabs are now real — the active class is driven by `viewMode`, clicking switches the main pane, and the topbar's `‹` / `›` arrows shift by 1 day / 1 week / 1 month respectively. The date heading reflects the view:

- Day:   "Sunday, May 24"
- Week:  "May 24 – 30, 2026" (or with month qualifier when the week spans months)
- Month: "May 2026"

The Today pill jumps the anchor to today regardless of view mode.

### Topbar tweaks

- Recurrence hint in the block modal no longer says "isn't materialized in views yet" — now it says "this block will appear on every matching day. Editing any occurrence updates the series."
- Modal save/delete callbacks now refresh against the current `viewRange` (not just `selectedDate`) so a save in Week view re-fetches the whole visible week, not just one day.

---

## Architecture notes

```
┌─────────────────┐   ┌───────────────────────────────┐   ┌──────────────────┐
│ listBlocksFor   │   │ listRecurringMasters          │   │ expandRecurring  │
│ Range(start,end)│   │ (beforeIso)                   │   │ Instances        │
└────────┬────────┘   └────────────┬──────────────────┘   └────────┬─────────┘
         │ real                    │ all masters with               │ phantoms
         │ blocks                  │ start_at < endIso              │ (excluding
         │ in range                │ (incl. ones before startIso)   │  master day)
         └────────────┬────────────┘                                │
                      │                                             │
                      ▼                                             ▼
                ┌─────────────────────────────────────────────────────────┐
                │ instances = [...real, ...phantoms]                       │
                │ — phantoms carry _phantom: true and _master_id           │
                │ — id is synthetic (master_id:date) so React keys stay    │
                │   unique                                                 │
                └────────────────────────┬─────────────────────────────────┘
                                         │
                                         ▼
                              passed into DayView / WeekView / MonthView
```

The pipeline is **per-view-range**, so opening a new week/month re-fetches and re-expands. Recurrence is cheap (linear in days × masters), so this stays well under one frame even at Year view if we eventually add it.

`recurringMasters` is kept separately from `blocks` because a master's anchor date might be outside the current view range — but its phantoms still project into the range, so we need the master object available for edit-routing.

---

## What I deliberately deferred

- **Per-occurrence overrides** — editing a phantom edits the master (the whole series moves). Skipping just one day, or moving one instance, would need a `daybook_block_overrides` table keyed on `(master_id, date)` with optional patch fields. Worth doing, but a separate build's worth of work.
- **Drag-to-resize / drag-to-move existing blocks** — hover affordance not in scope yet. Currently the only way to move a block is to edit it in the modal.
- **Templates sidebar + Goals sidebar** — Build 4. The sidebar still only has the mini-calendar and categories list.
- **Keyboard shortcuts** — Build 5 alongside Pomodoro and Weekly Review.

---

## Verification

| Check | Result |
|---|---|
| TypeScript | clean (`npx tsc --noEmit` exit 0) |
| Test suite | **329 / 329 passing** (8 new recurrence tests) |
| Production build | clean (1,069 KB / 328 KB gzipped — +9 KB JS for the new components) |
| New bundle hash | `index-W1Ii-O33.js` |

---

## Try it

After the deploy:

1. **Day** view as before — drag-to-create, click to select, double-click to edit.
2. Open a block, set **Repeat = Every day**, save.
3. Switch to **Week** — the block appears on every day of the week, with a dashed border and a small `↻` glyph.
4. **Double-click** a phantom in Week or Month view → the master's editor opens. Change the title, save. Every occurrence updates.
5. Click any **day header** in Week view or any **cell** in Month view → jumps to that day in Day view.

If the today tint in Week view feels too faint or too strong, the "+N more" cutoff feels wrong, or the phantom marker is too subtle / too loud — those are single-constant tweaks. Tell me what feels off.
