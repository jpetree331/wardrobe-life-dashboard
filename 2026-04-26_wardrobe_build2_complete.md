# 2026-04-26 — Wardrobe Build 2 + Verification

A summary of everything shipped today: Build 2 (Sanctuary + Timeline + ESV
proxy + entries CRUD) plus a verification pass that produced an automated
test suite, found ten real bugs, and fixed all of them.

---

## What's in the app right now

### Hallway (Build 1, unchanged)
Landing page with four breathing spheres in a pawprint layout. Click a
sphere → 5.2-second threshold transition → routed to `/sanctuary` or
`/timeline`. Wonder Room and Workshop are placeholders.

### Sanctuary — `/sanctuary`
Three-column layout (single mode) or binder + editor + scripture pane (dual
mode):

- **Binder** — chronological list of all sanctuary entries with date prefix
  and live search. Click an entry to load it; click `+ new` to compose.
- **Editor** — `contentEditable` page with execCommand toolbar (bold,
  italic, underline, strike, highlight, **red-letter** for Christ's words,
  H2 / blockquote / drop-cap / verse-number / **rubric** for liturgical
  small-caps red). Font family + size controls. Title is its own
  `contentEditable` line.
- **Inspector** — date picker, entry-type dropdown
  (Lectio / Examen / Prayer / Scripture / Journal), word count, tag
  add/remove, scripture-ref add/remove, delete.
- **Scripture pane** (dual mode) — translation switcher
  (KJV / WEB / ASV / BBE / Darby / YLT public-domain via `bible-api.com`,
  plus **ESV** routed through the Vercel edge proxy so the licensed token
  never reaches the browser). Verse markers rendered as superscript Sorts
  Mill Goudy. Selection toolbar over scripture body for Highlight + Copy.
- **Cross-room link** — when a Sanctuary entry's date matches a Timeline
  row, the inspector shows the day's one-sentence highlight in italics.
- **Auto-save** — 600ms debounced; optimistic local update; sequence-guarded
  so out-of-order responses can't overwrite newer state.
- **Deep-link composer** — `/sanctuary?date=YYYY-MM-DD` opens the matching
  entry, or creates a draft at that date if none exists.

### Timeline — `/timeline`
Excel-style year tabs over a sheet of `Date | Highlight | Tags | ✦` rows:

- **Year tabs** — `All` plus one per year that has rows; counts shown
  inline; `+ year` button seeds a new year via a Jan-1 placeholder.
- **Inline edit** — click in the highlight cell to edit the one sentence;
  blur or Enter commits. Edits don't get clobbered by unrelated re-renders.
- **Side editor** — 380px slide-in for date / sentence / tags. The
  `Linked Sanctuary entry` block appears when one exists for that date.
- **✦ Sanctuary link** — gold star when the date has a sanctuary entry,
  faint dot when not. Hover shows a popover preview; click navigates to
  `/sanctuary?date=…&id=…`.
- **Import** — drag-drop or pick `.xlsx` / `.csv` / `.txt`. Import dialog
  asks `Skip duplicates` vs `Overwrite duplicates` for dates that already
  exist. Each sheet name in an `.xlsx` is treated as a year.
- **Export** — `wardrobe-timeline.xlsx`, one sheet per year, columns
  `Date | One-sentence highlight | Tags`. Round-trips with Excel.

### Data layer (`src/lib/entries.ts`)
- All rows live in a single `entries` table scoped by `room`
  (`'sanctuary'` or `'timeline'`).
- Postgres view `timeline_with_sanctuary` (created `WITH (security_invoker
  = on)` so RLS evaluates as the calling user) joins each timeline row to
  the first sanctuary entry on the same date — one round-trip serves the
  Timeline page including the ✦ links.
- Partial unique index `entries_timeline_one_per_day` enforces the
  one-row-per-day rule for timeline only. Sanctuary still allows multiple
  entries per date.
- Because partial indexes can't be `ON CONFLICT` targets in Postgres,
  `upsertTimelineEntry` branches insert vs update by id rather than
  upserting. `bulkInsertTimeline` pre-fetches existing dates so the
  walk-the-rows path is one round-trip per row, not two.
- RLS scopes everything to `auth.uid()` — verified for both the table and
  the view.

### Scripture proxy (`api/scripture.ts`)
Vercel edge function. Routes only ESV; rejects other translations
(`bible-api.com` is hit directly from the browser for those). Parses the
`[N] verse` text shape into `{book, chapter, verse, text}` rows by fanning
the canonical reference's book + chapter across each verse. 24-hour CDN
cache. Token reads from `ESV_API_TOKEN` (server-only env var).

### Database migrations (`app/supabase/migrations/`)
1. `0001_init.sql` — `entries`, `user_prefs`, RLS, `updated_at` trigger.
2. `0002_build2.sql` — partial unique index + `timeline_with_sanctuary`
   view with `security_invoker = on`. **Run this in the Supabase SQL Editor
   before opening the Timeline tab** — `listTimeline` queries the view.

---

## Verification

**Tooling.** Vitest + jsdom + @testing-library set up at
`app/test/`. `npm test` runs the suite; `npm run test:watch` for TDD.

**Result.** **70 tests across 5 files, all passing.** TypeScript clean
(`tsc --noEmit` exit 0). Production build clean (`vite build` exit 0).

| Suite | Tests | What's covered |
|---|---|---|
| `esvParse.test.ts`     | 9  | Bracketed-verse parser: multi-verse, multi-word books, em-dashes, empty input, malformed refs, whitespace collapse. |
| `timelineImport.test.ts` | 26 | `normalizeDate`, `coerceDate`, `pickField`, `normalizeRow`, `parsePlainText` — every path through the import normalizer. |
| `entries.test.ts`     | 18 | Data layer with proxy-mocked Supabase: asserts ON CONFLICT is *never* used, room-scoped delete/update, year-range filters, bulk-import skip-vs-overwrite branching, 23505 propagation. |
| `scripture.test.ts`    | 14 | Asserts ESV routes through `/api/scripture` and *never* `bible-api.com`; URL encoding; non-OK error surfacing; translation catalog shape. |
| `saveRace.test.ts`     | 3  | Sequence-guard invariant: 2 and 3 overlapping saves with arbitrary completion order — only the latest wins. |

---

## Bugs found and fixed

### Caught by the test suite

**1. `Day` field shadow in import normalizer.** `pickField(['Date', 'date',
'DATE', 'Day', 'day'])` would grab a row's day-of-month "19" and try to
parse it as a full date, silently producing empty `entry_date` for every
spreadsheet that used split Year/Month/Day columns. Fixed in
[`src/lib/timelineImport.ts`](app/src/lib/timelineImport.ts) by removing
`Day`/`day` from the date-column candidates — `coerceDate` already handles
them when paired with Year/Month.

### Caught by self-review of Timeline.tsx

**2. `addToday` read stale `rows`.** When the user clicked "+ entry" on a
day that already had an entry, the 23505 catch handler did
`await refresh()` then `rows.find(...)` — but `rows` was captured by the
closure *before* the state update, so it never found the existing entry.
Fixed by inlining a fresh `listTimeline('all')` call instead of relying on
state.

**3. `Row` effect clobbered the contentEditable while focused.** Any
unrelated re-render (status flash, parent state change) would set
`textContent`, yanking the cursor and wiping in-flight typing. Fixed by
short-circuiting the sync when `document.activeElement === el`.

**4. Placeholder `::before` overlapped typed text.** The empty-state
placeholder didn't disappear on focus, so user keystrokes stacked
visually on top of the placeholder. Fixed in `Timeline.css` and
`Sanctuary.css` by adding `:not(:focus)` to the selector.

**5. Drag-drop depth counter could deadlock.** `dragenter` filtered for
`Files` type and `dragleave` didn't (because `dataTransfer` is masked on
leave for security). After enough non-files drags the counter went
negative and the dropzone never showed for a real files drag. Fixed by
keeping the counter symmetric and clamping at zero.

### Caught by self-review of Sanctuary.tsx

**6. `scRef` auto-fill wiped user typing.** The effect that pre-filled the
scripture pane reference from the active entry's `scripture_refs[0]` ran
on every save round-trip. Typing a new reference, then any save (e.g. a
keystroke in the editor) would revert the input. Fixed by guarding the
auto-fill with a ref so it only fires when `activeId` actually changes.

**7. Translation switch didn't auto-fetch.** Picking KJV → WEB while a
verse was already shown forced the user to click `Open` to refresh.
Fixed by adding `scTranslation` to the auto-fetch effect deps and
re-fetching when `scResult.translation !== scTranslation`.

**8. Inspector controlled inputs stuck during the 600ms debounce.**
Selecting "Lectio Divina" in the type dropdown snapped the dropdown back
to the previous value until the network round-trip completed. Same for
the date input. Fixed by making `scheduleSave` apply the patch
optimistically to local state before scheduling the timeout.

**9. Tag/scripture-ref optimistic updates never rolled back.** If a save
failed, the UI silently kept the user's optimistic change but the server
never persisted it — next page load, the change was gone. Fixed by adding
a refetch + replace path inside `scheduleSave`'s catch so the UI snaps
back to server state on failure.

**10. Save race — out-of-order responses overwrote newer state.** With
the debounce in place, two saves can still overlap if the second fires
after the first's network call already left the wire; if A's response
arrives after B's, A would clobber B's already-displayed result. Fixed
with a `saveSeq` / `lastAppliedSeq` ref pair: each fired save claims a
sequence number, and only writes results if it's still the latest. New
[`test/saveRace.test.ts`](app/test/saveRace.test.ts) covers the invariant
with three overlapping deferred promises in arbitrary order.

### Hardening

**11. xlsx supply-chain risk.** Replaced the unmaintained `xlsx@0.18.5`
(prototype pollution + ReDoS advisories) with the maintained fork
`@e965/xlsx`. API-compatible drop-in; all 67 import/export tests passed
without a single test code change. `npm audit` no longer flags any
production dependency — only the dev-server `esbuild` moderate that's
endemic to the Vite ecosystem and outside our control.

---

## File map (Build 2 deltas)

```
app/
├─ api/
│  └─ scripture.ts            # ESV proxy — full implementation
├─ src/
│  ├─ lib/
│  │  ├─ entries.ts          # NEW: typed CRUD for both rooms
│  │  ├─ scripture.ts        # NEW: routing client (public vs licensed)
│  │  ├─ esvParse.ts         # NEW: shared by edge fn + tests
│  │  └─ timelineImport.ts   # NEW: pure import normalizer (testable)
│  └─ pages/
│     ├─ Sanctuary.tsx + Sanctuary.css   # full UI replaces placeholder
│     └─ Timeline.tsx  + Timeline.css    # full UI replaces placeholder
├─ supabase/migrations/
│  └─ 0002_build2.sql        # partial index + view (run after 0001)
├─ test/
│  ├─ setup.ts
│  ├─ esvParse.test.ts
│  ├─ timelineImport.test.ts
│  ├─ entries.test.ts
│  ├─ scripture.test.ts
│  └─ saveRace.test.ts
├─ vitest.config.ts
└─ package.json              # +xlsx fork, +vitest deps, +test scripts
```

---

## Known caveats

- **Bundle size** — 897 kB unminified (279 kB gzip). Most of that is
  `@e965/xlsx`. The Import button is a good candidate for a dynamic
  `import()` to defer the cost until the user actually picks a file —
  worth doing in Build 3.
- **Tweaks panel** is deferred to Build 3 (themes, creaminess /
  lightness sliders, custom colors, font picker per-section).
- **Search across years** for Timeline isn't built — the binder search in
  Sanctuary does cover the title / body / tags / date.

## What to run before opening the app

```powershell
cd E:\git\life-dashboard\app
npm install
# In Supabase SQL Editor: paste & run 0001_init.sql, then 0002_build2.sql
npm run dev
```

Then open http://localhost:5180, sign in via the magic-link, and click
into either room.
