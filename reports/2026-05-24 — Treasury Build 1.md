# Treasury — Build 1 (the room itself)

**Date:** 2026-05-24
**Files added:** 4
- `app/supabase/migrations/0006_treasury.sql` — schema
- `app/src/lib/treasury.ts` — typed CRUD
- `app/src/pages/Treasury.tsx` — page + add/edit modal
- `app/src/pages/Treasury.css` — visual rhythm + promise highlight

**Files modified:** 3
- `app/src/App.tsx` — wired `/treasury` route
- `app/src/pages/Hallway.tsx` — added Treasury as 5th sphere
- `app/src/pages/Hallway.css` — repositioned satellites to fit five

A new 5th room in the Wardrobe. The Treasury is for verses kept from your Scripture reading — both **promises** (verses held as personal promises from God) and **stand-outs** (verses that arrested you in reading but aren't framed as promises). Promises get a soft yellow highlighter wash; stand-outs are plain on parchment.

---

## What shipped

### The room itself

`/treasury` — accessed via:
- Clicking the new Treasury sphere on the Hallway
- The `↔ sanctuary` link in Treasury's ribbon (sister-room shortcut)
- (Sanctuary-side promotion via "✦ keep" button lands in Build 2)

Layout:
- **Ribbon** — `← hallway`, `Treasury` place-name, `↔ sanctuary`, `+ Keep verse` button
- **Controls strip** — Pillbar filter (`All / Promises / Stand-outs`), sort selector (`Chronological / By book`), search box
- **Main list** — verse cards grouped by year (default) or by book of the Bible
- **Status footer** — count of kept verses

### Verse cards

Each card shows:
- Marked date (JetBrains Mono, dim)
- Reference (Cormorant) — e.g. *Romans 8:38-39*
- Translation chip (small monospace badge)
- For promises: a small `promise` italic tag in warm gold
- Verse text (EB Garamond italic, the visual focus, slightly indented like a quoted passage)
- Optional note (smaller, dimmed, with a thin left rule that reads like a marginal annotation)
- Hover-revealed `edit` link (top-right of the card)
- Double-click anywhere on the card to edit

Promise cards get a `color-mix(in oklab, #f4d460 14%, var(--page) 86%)` background — a faint yellow wash tinted with the room's warm parchment palette rather than a flat highlighter neon.

### + Keep verse / Edit modal

Same modal for both add and edit. Fields:
- **Date** — defaults to today (`localToday()`), settable to any date
- **Translation** — defaults to ESV; full TRANSLATIONS dropdown available
- **Reference** — free-text, parsed by `parseBibleRef` (supports "John 3:16", "Romans 8:38-39", "Ps. 23:1-3", abbreviations, en/em dashes, etc.)
- **Type radio** — Stand-out (default) or Promise (with the faint yellow wash applied to the promise radio's row, so the form previews the highlight)
- **Verse text** — text area + adjacent "Fetch" button that calls `fetchScripture(reference, translation)` and populates the text. Editable so the user can paste manually or tweak.
- **Note** — optional, multiline

Save validates: reference parses, verse text non-empty. Errors render inline as italic warning text.

Edit mode adds a **Delete** button at the bottom-left of the modal-actions row, with a confirm prompt.

### Schema (`0006_treasury.sql`)

One table, `treasury_verses`:

| column | type | notes |
|---|---|---|
| `id` | uuid | primary key |
| `user_id` | uuid | RLS-scoped via `auth.uid()` |
| `marked_on` | date | when the user encountered/kept the verse |
| `book` | text | canonical Bible book name |
| `chapter` | int | check `>= 1` |
| `verse_from` | int | not null, `>= 1` |
| `verse_to` | int | nullable; null = single-verse keep |
| `verse_text` | text | stored verbatim — preserved across translation changes / API drift |
| `translation` | text | defaults to 'ESV' |
| `kind` | text | check `in ('promise', 'standout')` |
| `note` | text | nullable |
| `source_entry_id` | uuid | nullable FK to `entries.id` for Build 2's Sanctuary promote-button |
| `created_at`, `updated_at` | timestamptz | with set_updated_at trigger |

Four indexes:
- `(user_id, marked_on desc)` — chronological default
- `(user_id, book, chapter)` — by-book sort
- `(user_id, kind)` — filter
- GIN tsvector on `verse_text + note` — future server-side full-text search

RLS: `auth.uid() = user_id` for-all policy. Matches the pattern from `0005_data.sql`.

### Hallway

The Hallway now hosts five satellites around Sanctuary instead of four. The new geometry puts Treasury on the **vertical centerline** between Notes (top) and Sanctuary (bottom):

| sphere | position |
|---|---|
| Notes | `left: 50%, top: 10%` (was 12%) — top-center |
| Timeline | `left: 14%, top: 20%` (was 16%/22%) — upper-left |
| Data | `right: 14%, top: 20%` (was 16%/22%) — upper-right |
| **Treasury** | `left: 50%, top: 36%` — middle, on the spine |
| Sanctuary | `left: 50%, top: 60%` (was 58%) — bottom-center, anchor |

This reads as a clean vertical axis (**Notes → Treasury → Sanctuary**) flanked symmetrically by Timeline and Data. The breathing-dawn animation delays were extended so Treasury fades in between Data (900ms) and Sanctuary (1400ms), preserving the staggered entrance choreography.

Hover transform for centered spheres (Notes + Treasury) keeps `translateX(-50%)` to avoid the scale lurch pushing them off-center.

The arc line (`<path d="M160 200 Q 500 40 840 200">`) over the top still connects Timeline → Notes → Data; Treasury sits under it on the centerline, which feels right — the arc is the upper canopy, Treasury is the trunk below.

---

## What you need to do once

1. **Run the migration**: open Supabase SQL Editor, paste `app/supabase/migrations/0006_treasury.sql`, run. Idempotent — safe to re-run.
2. **Deploy** (or `npm run dev`).
3. The Treasury sphere will be on the Hallway. Click it, then `+ Keep verse`.

---

## What's deferred to Build 2

- **`✦ keep` button next to each scripture ref in Sanctuary** — one-click promotion that opens the Add Verse modal pre-filled with the Sanctuary entry's date and the parsed reference, plus `source_entry_id` set so Treasury can later link back to the originating entry.
- **"from Sanctuary" tag on promoted verse cards** with click-through to the originating entry.
- **Server-side search** wired to the existing tsvector GIN index, if client-side filtering starts feeling slow on large collections.

---

## Verification

| Check | Result |
|---|---|
| TypeScript | clean |
| Test suite | **321 / 321 passing** (no new tests; logic is mostly UI-driven and existing parsers are already covered) |
| Production build | clean (1,037 KB / 320 KB gzipped — +10 KB JS for the new room + modal) |
| Bundle contents | new bundle hash `index-BciQQ-14.js` (busts any stale immutable cache from prior deploy); `treasury` strings appear in the output |

The verse text is stored verbatim in `verse_text` — so even if you change translations across kept verses, or the ESV API updates a passage, your kept version remains exactly as you marked it.
