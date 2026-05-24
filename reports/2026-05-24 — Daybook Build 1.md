# Daybook — Build 1 (foundation + Day view)

**Date:** 2026-05-24
**Files added:** 4
- `app/supabase/migrations/0007_daybook.sql` — four tables (categories, blocks, templates, goals)
- `app/src/lib/daybook.ts` — typed CRUD layer + date helpers
- `app/src/pages/Daybook.tsx` — the room (app shell + Day view + modals)
- `app/src/pages/Daybook.css` — vibrant theme scoped under `.daybook-page`

**Files modified:** 4
- `app/src/App.tsx` — `/daybook` route
- `app/src/pages/Hallway.tsx` — Daybook as 6th sphere
- `app/src/pages/Hallway.css` — `.s-daybook` position + animation delay
- `app/index.html` — added Newsreader, Work Sans, JetBrains Mono to the Google Fonts link

A sixth room in the Wardrobe — a **time-block scheduler** with a deliberately different visual world from the parchment family. The Hallway stays parchment; you step *through* the threshold and the aesthetic shifts to a clean near-white canvas with vibrant kid-puzzle category colors.

---

## What shipped in Build 1

### App shell

A four-area CSS grid:

```
┌──────────┬─────────────────────────────────┐
│  brand   │  topbar                         │  56px
├──────────┼─────────────────────────────────┤
│ sidebar  │  main (Day view)                │
│  232px   │                                 │
├──────────┼─────────────────────────────────┤
│ sidebar  │  status footer                  │
└──────────┴─────────────────────────────────┘
```

- **Brand cell** — red logo square with italic "D" + wordmark *"Day**book**"* (the "book" italic, electric blue)
- **Topbar** — prev/today/next nav, date heading (e.g. *Sunday, May 24*), `· EST` timezone suffix in mono, view tabs (Day active, Week/Month disabled with `Coming in Build 3` tooltip), a `+ Block` button (until drag-to-create lands), and a quiet `← hallway` link on the right
- **Sidebar** — mini calendar + categories list (templates & goals come in Build 4)
- **Main** — Day view canvas
- **Status footer** — block count + planned hours summary

### Day view

Two-column scroll layout. 6 AM → 11 PM, 72px per hour (comfy density, default per the design).

- **Time gutter** (64px) — JetBrains Mono hour labels at the top of each row, sticky-left
- **Canvas background** — three layered linear-gradients:
  1. Vertical notebook **margin line** at 40px from the left (red, 16% opacity)
  2. Hour rules
  3. Half-hour rules
- **Blocks** — absolutely positioned, 2px solid category-color border, 22% inner color wash for the puzzle-piece tint, paper background, 14px pill radius. Title in Newsreader 14/600, time in JetBrains Mono 10px, category name (uppercase 9.5px in the category color) if the block is tall enough
- **Size variants** — `.short` (32-55px) hides the category name and reduces padding; `.tiny` (<32px) hides the time too
- **Now-line** — only renders on today's date. 1px red bar with a 7px dot on the left and an `H:MM AM EST` pill on the right. Updates every 30s.
- **Auto-scroll to ~6:30 AM** on mount so the user lands on the morning

Click a block → opens the block editor modal in edit mode. The `+ Block` button opens it in add mode.

### Block editor modal

Single 560px modal handles both create and edit. Fields:

- **Title** — borderless Newsreader 22px text input with a rule-underline that darkens on focus
- **Category** — chip grid with a small color dot before each name; one chip per user category plus an *Uncategorized* fallback. Active = ink fill.
- **Date / Start / End** — native `<input type="date">` + two `<input type="time" step="900">` (15-min snap baked into the input). Times rendered in JetBrains Mono inside the input.
- **Repeat** — chips: Just this time / Every day / Weekdays / Weekly. *Recurrence is stored but not materialized in views yet* — Build 2 wires the expansion logic. The modal shows a hint when a non-`none` value is selected so you know it's saved-but-not-yet-rendered.
- **Notes** — Work Sans textarea, paper-deep background
- **Delete** button (edit mode only) — danger style, top-left of the action row
- **Cancel / Create-or-Save** — right-aligned

Validation: title required, end > start.

### Categories — user-defined with custom colors

Per your tweak: no hardcoded enum. The schema has a `daybook_categories` table; the user creates / renames / recolors / deletes their own.

**Seeding** — on first room visit, if you have no categories yet, the page lazily seeds the 6 vibrant starters from the design (Deep Work, Meetings, Personal, Health, Admin, Break) with their hex equivalents. You can immediately edit / recolor / delete any of them. Idempotent: a second visit doesn't re-seed if you've kept at least one.

**Sidebar Categories section** — list with a 10px color swatch, name, and a small count if there are blocks of that category on the day in view. Click any to open the category editor. `+ Add category` button at the bottom.

**Category editor modal** — Name + Color (native `<input type="color">` plus a side-by-side hex text input plus a live preview swatch). Delete with a clear warning: *"Any blocks using it will become uncategorized — not deleted."* Done via `ON DELETE SET NULL` so no data is destroyed; orphaned blocks render in the neutral fallback color (`#9498A8`) until you re-assign them.

### Mini calendar (sidebar)

7-column grid, current month with prev/next nav. Day states:
- Muted: outside the current month
- Today: red text with a small underline accent (`::after` 1.5px bar)
- Selected: ink background, paper text

Click any day → switches the Day view's selected date.

### Hallway sphere

Daybook is the 6th sphere, positioned at **lower-left under Timeline** at `(14%, 52%)`. The arrangement now reads:

| sphere | position |
|---|---|
| Notes | top-center |
| Timeline | upper-left |
| Data | upper-right |
| Treasury | center-spine |
| **Daybook** | middle-left (NEW) |
| Sanctuary | bottom-center (anchor) |

The asymmetry is deliberate: the **left column is "time-related"** (Timeline = past life events, Daybook = future schedule), the **right column** is Data alone. The vertical spine (Notes → Treasury → Sanctuary) anchors the center, and the heat of activity reads diagonally from past to future. Animation entrance delays slot Daybook in at 1250ms, between Treasury (1050ms) and Sanctuary (1500ms).

The sphere itself uses the same parchment outline + glow as all the others — **no preview of the vibrant world from the Hallway**. The aesthetic shift only happens once you cross the threshold. That's the surprise.

---

## Schema highlights

- **Categories are user-owned** — `(user_id, name)` unique constraint prevents dupes. Sort order is an integer; manual reorder won't fight us.
- **Blocks reference categories** with `ON DELETE SET NULL` — deleting a category orphans its blocks rather than destroying them.
- **Recurrence is stored, not materialized** — the `recur` column is preserved across saves so we don't need a schema bump when Build 2+ wires the expansion logic.
- **Tracked planned/actual minutes** are nullable columns on `daybook_blocks`, ready for Pomodoro integration in Build 5.
- **Goals** have an optional `for_week` date (Sunday-anchored) so weekly goals can live alongside persistent goals. The Build 4 sidebar UI will surface both together.
- **Templates** are a separate table with `duration_min`, `category_id`, and a decimal `start_hint` (e.g. `12.5` for 12:30 PM). Build 4 wires drag-to-day from the sidebar.

---

## Visual world

All tokens from the handoff are wired as CSS custom properties under `.daybook-page` so the vibrant palette stays **strictly scoped** — no leak into the parchment rooms. The room uses:

- **Palette**: paper `oklch(0.992 0.004 240)`, ink, ink-soft, ink-faint, paper-edge for borders, hot red `oklch(0.60 0.25 25)` for the margin line + the brand mark
- **Category colors**: per-category in DB (defaults: red / blue / green / mango / magenta / sunshine yellow), stored as hex but the room renders them with `color-mix(in oklab, ...)` when blending with paper for the 22% inner tint
- **Typography**: Newsreader for headlines, Work Sans for UI, JetBrains Mono for time/meta. Added all three to the Google Fonts link in `index.html`.
- **Radius**: 14px pill default
- **Focus**: vibrant theme uses electric blue (`--cat-meet`) for focus rings rather than parchment ink — a tiny but real change in keyboard affordance, because the vibrant world wants vibrant feedback

The `data-theme="vibrant"` attribute is set on the root element. The CSS only ships the vibrant rules (per handoff guidance: *"vibrant theme only — drop the paper/pastel theme variants"*).

---

## What's deferred (multi-build roadmap)

| Build | What lands |
|---|---|
| **2** | Drag-to-create on canvas + selection + hover tooltips + recurrence materialization |
| **3** | Week view + Month view + view-tabs become functional |
| **4** | Templates sidebar (drag-drop onto canvas) + Goals sidebar with checkboxes |
| **5** | Pomodoro widget + Weekly Review modal + Shortcuts modal + keyboard shortcuts + toasts |

Each build leaves Daybook usable; you can use Build 1 right now to add blocks via `+ Block`, edit by clicking, organize categories, navigate by day. The other builds add productive ceremony around what's already working.

---

## Verification

| Check | Result |
|---|---|
| TypeScript | clean |
| Test suite | **321 / 321 passing** (no new tests — pure-UI room, no business logic that warrants a test harness yet; the date helpers in `daybook.ts` will get unit tests when they grow more complex) |
| Production build | clean (1,057 KB / 324 KB gzipped — +20 KB JS / +5 KB gz for the new room) |
| New bundle hash | `index-BZ18_ZFh.js` (different from the previous `index-DQixmFap.js`) |
| Bundle contents | `Daybook` × 3 + `daybook` × 13 + `hours given shape` × 1 — all the user-facing strings are present |

---

## One thing to do once

Open Supabase SQL Editor and run `app/supabase/migrations/0007_daybook.sql`. Idempotent — safe to re-run. After that, deploy (or `npm run dev`) and the Daybook sphere is on the Hallway. Step through and your starter categories will be there waiting.

Edit any of them, change the colors, delete what you don't want, add your own. The room is yours.
