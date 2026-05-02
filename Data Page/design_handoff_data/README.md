# Handoff: Data — reading & Scripture tracker for Life Board

## Overview

`Data` is one of the rooms in the Life Board "mind palace" web app. It tracks what the user has read — both **Scripture** (Bible chapters/verses) and **Books** (regular reading) — and presents it across five views:

1. **Heatmap** — a GitHub-style year-grid of activity.
2. **Calendar** — a month grid with daily reading marks plus icons for linked Sanctuary / Timeline entries.
3. **Book × Chapter** — a per-book chapter matrix that lets the user see exactly when each chapter was read; in Books mode it becomes an authors-and-titles list with star ratings and reviews.
4. **Stats** — KPI tiles, top-N bar charts, monthly column chart, OT/NT donut, and a Goodreads-style "Years in books" retrospective.
5. **Reading Plans** — a Bible-reading-plan maker that partitions selected books across a date window and tracks completion **separately** from real reading.

A "+ Scripture" and "+ Book" entry button live in the top ribbon and open modals for adding new entries.

## About the Design Files

The files in this bundle are **design references created in HTML** — a working prototype showing the intended look, layout, and behavior. They are **not production code to copy directly**.

The task is to **recreate this design in the target codebase's existing environment** (React/Next, SwiftUI, etc.) using its established patterns, design system, and data layer — or, if no environment exists yet, to choose the most appropriate framework for the project and implement it there. The HTML uses inline-`<script>` seed data for demonstration; in production all data should come from the real backend (see "Data model" below).

## Fidelity

**High-fidelity.** Final colors, typography, spacing, interactions, and copy are all set. The mock should be matched closely. Substitutions for the design system's preferred fonts/colors are fine if the target codebase already has a unified system, but the parchment palette, serif typography, and overall "contemplative library" feel are intentional and should be preserved.

## Visual System

### Color tokens

```
--bg:           #efe7d6   /* page background — warm parchment */
--bg-2:         #e4d8bf   /* slightly darker parchment (ribbon, panel chrome) */
--bg-3:         #d8caa8   /* hover background */
--panel:        #ece3cf
--page:         #faf5e8   /* card / panel surface */
--ink:          #2b2419   /* primary text */
--ink-soft:     #5a4f3c   /* secondary text */
--ink-faint:    #8a7d63   /* tertiary text, italic captions */
--line:         #2b241933 /* borders, ~20% ink */
--line-strong:  #2b241955 /* stronger borders */
--accent:       #7a6a3a
--accent-strong:#9c8240
--red:          #8a2a1a   /* star color (Goodreads-like) */
```

Heatmap themes (5-step ramps, user-selectable from a swatch row):

| Theme   | step 1   | step 2   | step 3   | step 4   | step 5   |
|---------|----------|----------|----------|----------|----------|
| sage    | #e2dcc6  | #c8d3b3  | #a8bd8d  | #82a165  | #5a7e3f  |
| rose    | #efe1d8  | #efd1c4  | #e0a895  | #c87a5e  | #a85540  |
| sky     | #e0e6ec  | #c9d6e1  | #9bb1c2  | #6e8aa3  | #4d6b85  |
| violet  | #e6dfe8  | #d8cce0  | #b69cc4  | #8d76a8  | #6b568a  |
| saffron | #f0e7c8  | #efe0a8  | #dec476  | #c5a347  | #b08820  |
| ink     | #dcd5c2  | #c8c1ae  | #8e8674  | #5a5142  | #2b2419  |

Empty heatmap cell color: `#e8e1cc`.

Calendar entry-marker colors (intentionally distinct):
- Sanctuary marker: **circle** in `#b8521a`
- Timeline marker: **square** in `#3e5a78`

### Typography

Three families (loaded from Google Fonts in the prototype):

- `'Cormorant Garamond'` — display headings, place name, panel titles, year labels, KPI numbers. Weights 300/400/500/600.
- `'EB Garamond'` — body text, italic captions. Weights 400/500/600 + italic.
- `'JetBrains Mono'` — small numerics (counts, page totals, month axis labels). Weight 400/500.

Common type recipes:

- Section title: Cormorant Garamond 22px / 400 / `--ink`.
- Card sub: EB Garamond italic 13px / `--ink-faint`.
- Tab labels: Cormorant Garamond 14px uppercase letter-spacing 0.22em / `--ink-faint`, active = `--ink` with 2px bottom border.
- Tertiary metric label: Cormorant Garamond 11px uppercase letter-spacing 0.22em / `--ink-faint`.
- Big stat number: Cormorant Garamond 44px / `--ink`.

### Spacing

Panel padding: 22px 26px. Section gap inside main: 22px. Stat cards: 18px 20px. Modal: 16px 22px head/foot, 22px body. Standard form `gap: 12–14px` between fields. Tab inner padding: 12px 18px.

## Layout & Chrome

```
┌──────────────────────────────────────────────────────────────────┐
│ ribbon   ← hallway   |   D A T A          [+ Scripture] [+ Book] │ <- 12px 22px
├──────────────────────────────────────────────────────────────────┤
│ tabs:  Heatmap | Calendar | Book × Chapter | Stats | Plans       │ <- bottom-bordered
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  <view content, scrollable>                                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

- Body is `display:grid; grid-template-rows: auto auto 1fr; height: 100vh; overflow: hidden`. Only `<main>` scrolls.
- Page fades in (`@keyframes fade` 700ms ease-out applied to `<main>`).

The "← hallway" link goes back to the parent Hallway page (route TBD by the host app — in the prototype it's `Hallway Wireframes.html`).

## View Specs

### 1. Heatmap

A GitHub-style year grid. Layout: 1fr left card + 80px right "year rail".

Card contents:
- Title + sub on the left.
- Controls (right): pillbar **Source** (Scripture / Books), pillbar **Unit** (Verses / Chapters — auto-relabeled to "Pages / Sections" when source is Books), and a row of six round **theme swatches** (24px circles with linear-gradient fills representing each ramp).
- Summary line: `<N> verses across <M> days` with an italic hint "click a square to see that day".
- Grid: 12px squares, 3px gaps, 7 rows (Sun→Sat) with Mon/Wed/Fri labels, columns auto-flow by week. Month labels are positioned by week-column index. Future cells are transparent. Hover shows a tooltip with date, value, and up to 3 reading refs.
- Legend "Less … More" with the 5-step scale.
- Right rail: vertical year buttons (2026, 2025, 2024, 2023). Active = `--ink` background with `--bg` text.

Bucketing rule: for each `YYYY-MM-DD`, sum verses (or chapters) from Scripture reads, or pages (or "sections" = pages/50) from book reads. Each chapter without an explicit verse range counts as `AVG_VERSES_PER_CHAPTER = 25`.

Level thresholds:
- **chapters**: <1 → l1 (palest, "less than a chapter"); <2 l2; <4 l3; <8 l4; ≥8 l5.
- **verses / pages**: <5 l1; <15 l2; <30 l3; <60 l4; ≥60 l5.

### 2. Calendar

Month grid. Top row: ‹ prev | "Month YYYY" (Cormorant 26px) | next ›, then a legend on the right showing the circle/square markers.

Cells:
- Aspect ratio 1.05; parchment background, 1px line border.
- Number top-right (Cormorant 16px). Today = bordered with `--ink`. Future days dimmed.
- If reads exist that day: cell is tinted using the same level scale (l1–l5) blended with `--bg` via `color-mix`.
- Bottom: up to 2 references in mono 11px (e.g. "Romans 8 · Psalms 23"), with `+N` overflow.
- Top-left: icons row. Sanctuary = 8×8 circle `#b8521a`, Timeline = 8×8 square `#3e5a78`. Both have a 1px `--line-strong` shadow ring and 1px `--bg` border.

Source pillbar swaps between Scripture refs and "<N> pages · <author>" rendering.

### 3. Book × Chapter

Two-column layout: 220px book/author rail + chapter grid + reads pane.

Scripture mode:
- Rail = list of 66 books grouped by sticky **Old Testament / New Testament** section heads (Cormorant 11px upper, lettered 0.22em). Each row is bookname + read-count chip on the right (mono 11px `--ink-faint`). Active row = `--ink` background.
- Right pane: book title, "<N> chapters · <M> readings in the last year" sub.
- Chapter grid: `repeat(auto-fill, minmax(34px, 1fr))`, square cells. Color shading by read-count: 1=`heat-1`, 2=`heat-2`, 3=`heat-3`, 4=`heat-4`, 5+=`heat-5`. Selected chapter has 2px `--ink` outline.
- Reads pane (right of grid): "<Book> <Chapter>" header, "<N> readings" sub, then an unordered list. Each item = date (Cormorant 13px letter-spacing 0.06em, fixed 110px column) + verse range (italic).

Books mode (after pill toggles to "Books"):
- Rail = authors A→Z with their finished count.
- Reads pane = all titles by the selected author, sorted by date desc. Each item shows: date | title + page count | star rating (red ★) | "review" button if a review exists.
- Clicking "review" expands an italic block of body text below the row. Background `--bg-2`, 3px left border in `--heat-4`.

### 4. Stats

Source pillbar Scripture / Books switches the entire body.

Scripture stats:
- 4-up KPI grid (auto-fit minmax 280px): Reading days, Verses, Chapters, Longest streak.
- 3-up below: Top books read (horizontal bar chart, name | bar | count), By month (12 vertical bars), OT vs NT donut.
- Bar chart: rows are `grid-template-columns: 110px 1fr 50px`; bar is 12px tall with `--bg-2` track and `--heat-4` fill.
- Donut: SVG, 42×42 viewBox, two stroke-arc circles using heat-1 and heat-4 from current theme; small percentage label centered.
- Month bars: percentage-of-max heights, 110px container, mono axis labels below.

Books stats:
- 4-up KPI: Books finished, Pages, Authors, Reading days.
- 2-up: Top authors bar chart, Recently finished list (Cormorant title + italic author·date·pp meta).
- **Years in books** (Goodreads-style retrospective): full-width panel below.
  - Layout: 1fr rows + 240px sidebar.
  - Each year row: 56px year label (Cormorant 26px) | 28px bar with count printed in `--page` text inside the fill (mono 12px) | "details" button.
  - Click a year → expand inline panel with 3px `--heat-4` left border. Inside: rows grouped by star rating (5 → 1), each row = 90px star column (red ★ on/off) + chip-flow of titles (italic title + author surname suffix).
  - Year footer: 4-up summary — Books, Pages, Longest title, Shortest title.
  - Right sidebar: persistent **Longest** / **Shortest** card across the entire history.

### 5. Reading Plans

Two-column: 320px form + 1fr output.

Form fields:
- **Plan select** dropdown at top of section (in panel head controls): existing plans + "+ new plan", with a Delete button.
- Name (text).
- Books — scrollable checkbox list of all 66 books, max-height 200px.
- Start / End — two date inputs, side by side.
- Days of the week — 7 toggle squares S M T W T F S (30×30, bordered, active = `--ink` filled).
- Unit — Chapters / Verses select.
- Per session — number 1–50.
- Build / update plan — primary button.

Output:
- 4-up summary tile (Sessions, Chapters/Verses total, Completed, % progress).
- Rows: `90px date | 1fr reading | check`.
- Date in Cormorant. Reading reference in EB Garamond. Check is a custom 18×18 checkbox; checked rows get strikethrough on the reading, faded color, and the plan tracks completion in-memory (persist to backend in production).
- Past sessions render with a faded date but otherwise normal — completion state is what matters.

**Critical rule the user asked for:** plans only track what they *plan* to read; the regular Scripture tracker only records what was *actually* read. Plan completions and Scripture reads are separate write-paths. Don't auto-mark a plan row when a matching Scripture entry is added — the user is welcome to do both manually.

## Add-Entry Modals

Triggered by the ribbon's `+ Scripture` and `+ Book` buttons.

Backdrop: `rgba(43, 36, 25, 0.45)` with 2px backdrop-blur. Modal width: min(560px, 92vw), max-height 88vh. Three rows: head (24px Cormorant title + × close), scrolling body, foot (Cancel / Save).

**Scripture form:**
- Date (default today).
- Book (select of all 66) | Chapter (number) | How much (Whole chapter / Verses…).
- If "Verses…" selected: From / To verse number row appears.
- Note (textarea, optional).

**Book form:**
- Date finished | Pages.
- Title (text).
- Author (text).
- **Star rating** — five stars side-by-side, 28px, click to set, hover preview lights stars up to the hovered index. Rating stored as 0–5 integer.
- Review (textarea).

On save: append to the in-memory store (production: POST to API), close modal, refresh whatever views are currently mounted.

## Data Model

In production these would be backend tables. Field shapes used in the prototype:

```ts
type ScriptureRead = {
  id: string;
  user_id: string;
  date: string;            // 'YYYY-MM-DD'
  book: string;            // canonical Bible book name, e.g. "Esther"
  chapter: number;         // 1-indexed
  verses?: [number, number]; // inclusive range; absent = whole chapter
  note?: string;
  created_at: string;
};

type BookRead = {
  id: string;
  user_id: string;
  date: string;            // date finished
  title: string;
  author: string;
  pages: number;
  rating: 0 | 1 | 2 | 3 | 4 | 5;
  review?: string;
  created_at: string;
};

type DailyPageRead = {  // for the heatmap "Books" mode
  id: string;
  user_id: string;
  date: string;
  pages: number;
  title?: string;
  author?: string;
};

type ReadingPlan = {
  id: string;
  user_id: string;
  name: string;
  books: string[];         // array of canonical Bible book names
  start: string;           // 'YYYY-MM-DD'
  end: string;
  days_of_week: number[];  // 0=Sun..6=Sat
  unit: 'chapters' | 'verses';
  per_session: number;
  // completion is per (book, chapter) — store in a join table:
};
type PlanCompletion = {
  plan_id: string;
  book: string;
  chapter: number;
  completed_at: string;
};
```

The prototype also references a `sanctuary_entries` and `timeline_entries` source for the calendar markers — only the **set of dates with at least one entry** is needed for that purpose. A simple `GET /entries/has-by-date?from=…&to=…` endpoint per source is sufficient.

### Bible reference data

The prototype hard-codes the 66-book chapter-count list and `AVG_VERSES_PER_CHAPTER = 25`. For accurate verse stats in production, ship a real verse-count table per (book, chapter). A common public-domain source is the OSIS book/chapter/verse manifest.

## Interactions

- **Tab routing** in the section nav: lazy-init each view on first activation.
- **Heatmap tooltips** follow the cursor with `position: fixed` and a 14px offset; show date, value, and up to 3 reading refs.
- **Theme swatch click** updates CSS custom properties live; calendar and matrix re-render to pick up the new ramp.
- **Year rail click** swaps the year and re-renders the heatmap.
- **Calendar prev/next** moves month-by-month, looping years.
- **Book × Chapter**: clicking a book sets `book`; clicking a chapter sets `chapter`; reads pane updates.
- **Reviews**: toggle button per row swaps between `review` ↔ `hide` text and toggles the italic block.
- **Plan build**: validates that books, dates, and at least one weekday are set; otherwise alerts. Plans are stored in an in-memory `PLANS` array in the prototype; production should persist.
- **Modal save**: validates required fields per kind, prepends the new entry to the in-memory store, refreshes mounted views.

## State Management

Top-level state needed:
- `heatState`: `{ year, source: 'scripture' | 'books', unit: 'verses' | 'chapters', theme }`.
- `calState`: `{ year, month, source }`.
- `matrixState`: `{ source, book, chapter }`.
- `statsSource`: `'scripture' | 'books'`.
- `yearOpen`: which year is expanded in the Years-in-books panel.
- `planActive`: id of the plan being edited (or `null` for "new plan").
- `modalOpen`, `modalKind`.

Plus the data stores listed in the data-model section.

In React/Vue/Solid, treat these views as independent route-children and keep their state local; only the **data stores** need to be shared (via a query/cache layer).

## Files in this bundle

- `Data.html` — the working prototype.
- `README.md` — this file.

## Notes

- The `claude.complete` hook is **not** used in this prototype — no AI calls.
- All sample data is synthetic and seeded from deterministic mulberry32 RNGs so the prototype renders the same numbers each load. Don't ship the seeders.
- Star color (`--red: #8a2a1a`) is used only for ratings — keep it scoped or it will leak into other places.
- The "← hallway" link is a relative file link in the prototype; in the host app it should become a route push to `/hallway`.
