# Wardrobe

> *A quiet web app for the contemplative life — Scripture you've read, books you've finished, days you've shown up.*

Most personal dashboards measure your inputs: steps, screens, calories, sleep. **Wardrobe** measures what you've *attended to* — the chapter you read this morning, the book that ended last Sunday, the prayer you wrote down with a Psalm next to it.

It's named after Narnia's: the entrance looks ordinary, the inside is a country.

---

## What it is

A web app built around a single contemplative practitioner — organised as a small collection of **rooms**, each with a different shape, a different rhythm, a different reason. You start in a hallway with six soft glowing spheres. Click one and step inside.

It's built for the person who wants to keep a thoughtful record of their reading and devotional life *without* the gamified grind of a habit tracker. No streaks shouting at you. No "you broke a 73-day chain." Just calm, beautiful infrastructure for paying attention.

Fork it for your own practice. Or read the code — most of the rooms are 200–500 lines of legible React + TypeScript, with the math factored into pure modules and 320+ tests behind it.

---

## The rooms

### Sanctuary
A devotional journal you write in directly. Each entry has a date, a mood, a body, and (the killer feature) a tag for the Scripture passage it engages with. Pull up that passage in any of several translations — ESV, KJV — alongside the entry. Highlight verses inline; your highlights persist across visits. The Scripture references you tag here automatically flow into the **Data** room's reading log, so journaling doubles as your reading record.

### Timeline
A year-by-year chronological view of your life — the running list, the long view. Import from XLSX or CSV; export the same. Day-shared with Sanctuary, so a date with a Sanctuary entry shows up tagged on the Timeline.

### Notes
A board-style scratchpad. Multiple boards, each with cards you arrange freely. For ideas in flight that aren't ready to be a Sanctuary entry yet.

### Data
The reading & Scripture tracker. Five tabs:

- **Heatmap** — a year's worth of reading rendered as a Sunday-to-Saturday rectangle of color squares. Six themes (sage, rose, sky, violet, saffron, ink). Resize the grid by dragging the corner; chevrons page through every year of history. Days with reading darken; future days stay empty. DST-immune (built the right way).
- **Calendar** — a month-grid view showing which days you read, with cross-room markers indicating Sanctuary and Timeline activity on the same day.
- **Book × Chapter** — a coverage view of where you've spent time across the canon (Bible) or the library (books). Pick a Bible book from the rail; see every chapter as a tile, shaded by how often you've read it. Click a chapter to see every entry behind it. In Books mode, swap the Bible-book rail for an A→Z author rail with their finished works listed.
- **Stats** — your reading life as a single page of numbers. KPIs (verses, chapters, books finished, pages, longest streak), a monthly bar chart, an Old/New Testament donut, the books or authors you've spent the most time with, and a "Years in Books" / "Years in Scripture" retrospective at the bottom that opens to show what you read each year, grouped by star rating.
- **Plans** — multi-plan reading plan tracker. Built-in presets (Bible in a Year, NT in 90 Days, Gospels in 30 Days, Psalms in a Month) plus custom plans with day-of-week, books-selected, and pace controls. Each plan tracks itself against the wall-clock and tells you whether you're ahead, on pace, or behind by N sessions.

### Treasury
A keepsake room. The verses, quotes, and promises you want to carry. Tag each one (verse, quote, promise, standout) and they sort onto the same chronological page; promises get a faint highlight so you can scan for them at a glance. The ✦ keep button inside a Sanctuary entry lifts any Scripture reference straight into Treasury with one click — the Treasury card then links back to the entry it came from. Search, filter by type, sort by date or by book of the Bible.

### Daybook
A time-block scheduler. Visually a different room from the rest — vibrant, kid-puzzle palette rather than parchment, because parchment didn't fit the act of *planning*. Drag a span on the canvas to create a block; double-click to edit; hover for the full detail card. Day / Week / Month views all share the same blocks. Set a block to repeat daily, weekdays, or weekly and every matching day shows it (a dashed border + a small ↻ glyph mark recurring instances). User-defined categories with your own colors.

---

## Things it does that nothing else quite does

- **Scripture references flow between rooms.** Tag `Psalm 23` on a Sanctuary entry; it appears in the Data heatmap, in the Book × Chapter coverage view, in the year retrospective. Lift it into Treasury with one click and it carries the entry it came from. One source of truth, many surfaces.
- **Real verse counts.** The Bible isn't averaged — every chapter's verse count comes from a hand-verified manifest of the canonical 66 books (31,102 verses across 1,189 chapters). When the Data room says you read 23 verses, it means 23.
- **Goodreads import.** Drop in your `goodreads_library_export.csv` and your read shelf — including books from twenty years ago — flows into the Data room. Idempotent on `(title, finished_on)` so re-running is safe; the preview shows exactly what will be imported and what will be skipped before you commit.
- **Multi-translation Scripture.** Read the same passage in ESV and KJV side-by-side without leaving the entry.
- **Recurrence the right way.** A repeating block stored once shows on every matching day. Edit any occurrence — the whole series updates. DST-immune; no millisecond math across days.
- **Local-time everything.** Dates aren't UTC strings that drift across timezones. They're local `YYYY-MM-DD`, computed the right way. The heatmap doesn't lose squares to DST.
- **Magic-link auth.** No passwords. No social logins. Just an email and a link.
- **Reading-plan pace tracking.** Says "behind by 2 sessions" or "ahead by 1" instead of just %-complete. You know exactly where you stand.
- **Six color themes** for the heatmap, each tuned for a different mood. Switch any time.

---

## A note on the design

The voice is deliberately literary. **Cormorant Garamond** for headings, **EB Garamond** for body, **JetBrains Mono** for the numbers. Italics for emphasis. A warm parchment palette built around an "ink" color rather than pure black, applied via CSS custom properties so the whole room can shift theme without touching component code.

The Daybook is the deliberate exception — vibrant kid-puzzle palette, Newsreader serif, Work Sans UI. Scheduling didn't want to be parchment; it wanted to be vivid. So the whole room is sealed under its own `.daybook-page` scope and the rest of the app stays parchment.

Every numeric column uses `tabular-nums` so digits line up vertically across rows. Every interactive element has a focus ring. The pace pill on a reading plan uses a glyph (↑ ahead, → on pace, ↓ behind) so it isn't legible only by color.

The result feels less like a spreadsheet and more like a leather-bound commonplace book — with a vibrant calendar tucked inside its back cover.

---

## What's under the hood

| Layer | Choice |
|---|---|
| Framework | React 19 + Vite + TypeScript (strict mode) |
| State / data | Direct Supabase client; React's `useState` and `useMemo` |
| Auth | Supabase magic-link, with row-level security on every table |
| Database | Postgres (Supabase) — RLS policies on every table, schema in `app/supabase/migrations/` |
| Scripture API | ESV via a thin Vercel edge function proxy (token never exposed to browser) |
| CSV / XLSX | Hand-rolled CSV parser for Goodreads (no dependency); `@e965/xlsx` for Timeline import/export |
| Testing | Vitest + jsdom — **329 passing tests** across the pure aggregation, parsing, recurrence, calendar, and verse-count layers |
| Hosting | Vercel for the static app + edge functions; Supabase for data |

The aggregation logic — heatmap level bucketing, calendar grid building, plan pace status, top-N rollups, Goodreads CSV parsing, Daybook recurrence expansion — lives in pure helper modules with zero React or Supabase imports, so the math is unit-testable in isolation.

---

## Running your own

The data model assumes one user per Supabase project — but the source is here, the migrations are versioned, and you can stand up your own copy in about ten minutes.

```bash
git clone <this-repo>.git
cd wardrobe-life-dashboard/app
npm install
npm run dev
```

You'll need:
- A free Supabase project (run the migrations in `app/supabase/migrations/` in order)
- An ESV API token (free for personal use from <https://api.esv.org/>)
- Optionally, a Vercel account to deploy

Full setup details in [`app/README.md`](app/README.md), including environment variables, the SQL migration order, and Vercel deployment steps.

---

## Repo layout

| Path | What's there |
|---|---|
| [`app/`](app/) | The running React + Vite + Supabase application. **Start here if you're cloning.** |
| [`Life Board/`](Life%20Board/) | Original Sanctuary + Hallway visual handoff — the design source of truth for those rooms. |
| [`Timeline/`](Timeline/) | Timeline visual handoff — design source of truth for the Timeline tab. |
| [`docs/`](docs/) | Design handoffs for each room and pre-build ideation. |
| [`reports/`](reports/) | Per-build implementation reports — the engineering reasoning behind each push. |

---

## Why "Wardrobe"

You walk past a piece of furniture in your house every day. One afternoon something opens. You step through, and there's snow.

That's the feeling.

---

## License & credits

The source is shared as-is. Use it as a reference, fork it for your own contemplative practice, contribute back if you find a bug. No warranty, no roadmap, no obligation — just one careful implementation of an idea, made available.

Bible verse counts are derived from the public-domain King James Version. Scripture text comes from the [English Standard Version](https://www.esv.org/) via their developer API; respect their license terms if you self-host.

Built with care, slowly, by hand.
