# Goodreads import + edit-book affordance

**Date:** 2026-05-03
**Files touched:** 5
- `app/src/lib/goodreadsImport.ts` (new — pure parser + dedupe helpers)
- `app/src/lib/data.ts` (added `updateBookRead`, `bulkCreateBookReads`)
- `app/src/pages/Data.tsx` (`BookFormModal`, `GoodreadsImportModal`, edit affordance)
- `app/src/pages/Data.css` (styles for import modal, file picker, edit affordance)
- `app/test/goodreadsImport.test.ts` (new — 25 tests)

Two related capabilities that landed in one push: bulk import from a Goodreads CSV, and inline editing of book entries (so you can fix the missing page counts the import surfaces).

---

## What you asked for

> "Would it be possible to import the Goodreads data into the new data page for books I've read? It's a CSV file, that same one you found earlier and put in gitignore."

Plus four follow-up decisions you confirmed:

1. ✅ Only "read" shelf books — the 75 to-read and 1 currently-reading are skipped
2. ✅ Fall back to Date Added when Date Read is missing
3. ✅ Edit-book capability so you can fill in page counts after import
4. ✅ Re-reads handled as best-as-Goodreads-allows
5. ✅ Reviews preserved as plain text (HTML normalized away)
6. ✅ Footer link in `+ Book` modal
7. ✅ Default to skipping duplicates by `(title, finished_on)`

---

## How it works end-to-end

### Click `+ Book` → see the import option

The capture modal you've been using to log books has a new dashed-rule footer:

> *Have a Goodreads library?* **Bulk import from CSV**

Click → modal swaps to the import flow. Hidden so it doesn't clutter the room when you're just logging a book, but always discoverable when you want it (so re-imports later are easy).

### Phase 1: pick a file

A big dashed file-pick button. Drop your `goodreads_library_export.csv` on it. The instructions tell you where to get the CSV from Goodreads itself:

> *Goodreads → My Books → Import and export → Export Library*

### Phase 2: preview

The CSV gets parsed instantly (no server round-trip — CSV parsing is a pure function). The preview shows:

- **Headline:** "228 books ready to import" (with " · 0 skipped as duplicates" if applicable)
- **Detail bullets** — each only shown if it applies:
  - Skipped 76 on other shelves (75 to-read, 1 currently-reading)
  - 6 books had no Date Read — using Date Added as a stand-in
  - 9 books had no page count — pages set to 0; you can edit them after import (click *edit* on any book card)
  - 5 re-reads — Goodreads only stored one date per book; each will be imported once with the most recent date, and you can add the earlier reads via *+ Book*

- **First few books to import** — a scrollable preview list with the first 8, showing date, title, author, pages, stars, and small chips for "date est." (when we fell back to Date Added) and "re-read" (when Read Count > 1). With more than 8, there's a "…and N more" footer.

You see exactly what's about to happen before you commit.

### Phase 3: insert

Click **Import 228 books**. The modal switches to a progress message ("Importing 228 books…"), then bulk-inserts in batches of 100 via `bulkCreateBookReads`. The schema's `data_book_reads` already had everything the import needs — no migration required.

### Phase 4: done

Confirmation page with the inserted count. If any books needed a manual page-count fix-up, a reminder note tells you where to find them ("open *Book × Chapter → Books* and click *add pages* on each").

---

## Edit-book

Asked for via "is it possible edit and add the number if I find it? would like this." Yes, and broader than just pages — a generic edit capability is more useful long-term than a one-off page-count tool.

In **Book × Chapter → Books** mode, every book card now has:

- A small **edit** affordance on the right that's hidden until you hover (`opacity: 0` → `1`). It also becomes visible on keyboard focus, so it's accessible without a mouse.
- For books with **0 pages**, a dashed pill button labeled **add pages** that's always visible (because that's the specific case the import flagged) — clicks the same edit modal.

Click either → opens the same `BookFormModal` you use for `+ Book`, but pre-filled with the existing values and with the title showing "Edit book." Submit calls `updateBookRead` instead of `createBookRead`.

`BookFormModal` is a single component that handles both create and edit via an optional `existing?: BookRead | null` prop. Same form, same validation, same star widget, same review textarea. Only the `onSubmit` path branches.

---

## Architecture decisions

### Where the parser lives

`app/src/lib/goodreadsImport.ts` is a pure module with no React or Supabase dependency. Three exports:

- **`parseCSV(text)`** — hand-rolled CSV parser that handles quoted fields with embedded commas, escaped quotes (`""` → `"`), `\r\n` and bare `\r`, and newlines inside quoted fields. About 30 lines. No external library — Goodreads' format is consistent enough that PapaParse would have been overkill, and we'd be paying ~40KB gzipped for one feature.

- **`buildImportPreview(rows)`** — takes parsed rows, filters to the "read" shelf, builds candidate rows with cleaned data (date format conversion, HTML stripping in reviews, rating clamping), and returns aggregate stats for the preview UI.

- **`dedupAgainstExisting(candidates, existingBooks)`** — your idempotency guard. Builds a Set of `${title.toLowerCase()}|${finished_on}` keys from existing rows, filters out matching candidates. Also dedupes within the import itself in case Goodreads has duplicate rows for any reason. Returns the filtered list plus the duplicate count for the preview.

All three are independently testable without any UI or database setup. **25 unit tests** cover them — CSV edge cases (escaped quotes, multi-line fields, blank trailing lines), date parsing (zero-padding, malformed input, empty), HTML normalization (`<br/>`, `<p>`, entity decoding, blank-line collapsing), the preview builder (shelf filtering, fallback dates, missing pages, re-reads, rating clamp), and dedupe (matching, case-insensitive titles, within-import dedupe).

### Where the modal lives

In `Data.tsx` alongside the other capture modals (`AddScriptureModal`, `BookFormModal`, `AddDailyPagesModal`). Same `<Modal>` scaffolding, same `dt-form` styling conventions. The phase machine (`pick → preview → inserting → done`) is straightforward state, no library needed.

### Idempotency strategy

Match key: `(lowercased title, finished_on)`. If you re-run the import after a re-read, here's what happens:

- First import (2024 finish): Goodreads exports `Date Read = 2024-06-12`, you import → row at 2024-06-12.
- You re-read in 2026, update Goodreads, re-export. Now Goodreads says `Date Read = 2026-04-12` (it overwrites with the most recent).
- Second import: candidate has `finished_on = 2026-04-12`. The existing row at 2024-06-12 doesn't match. So this is treated as a new row.

That gives you **two rows** for the same book — one for each finish date. Which is correct! Each row in `data_book_reads` represents one "I finished this on this date" event, and both are real. The Books-mode pane in Book × Chapter view shows them as separate entries under the same author, so re-reads show up naturally as multiple rows.

This is the right behavior for the data model, but it relies on Goodreads' "latest date wins" export quirk. If a future Goodreads export starts including all read dates (a paid feature today), the import would just work with that too — the candidate-by-candidate dedup would still skip the older finishes you already imported.

### The five re-reads in your library

I checked: of the 5 books with `Read Count > 1`, only 2 actually have a `Date Read` recorded:

| Title | Read Count | Date Read |
|---|---|---|
| Words of Radiance (Stormlight #2) | 2 | 2014-04-07 |
| The Emperor's Soul | 2 | 2014-05-07 |
| Gazing Into Glory | 2 | (none → falls back to Date Added) |
| The Way of Kings (Stormlight #1) | 2 | (none → falls back to Date Added) |
| The Holy Bible: KJV | 2 | (none → falls back to Date Added) |

So those will be imported once each. If you want to record the second read, click `+ Book` and add a manual entry with the right date — it becomes a separate row in the same book group.

### Bulk insert batching

`bulkCreateBookReads` inserts in batches of 100. PostgREST has payload limits and 228 rows in one shot might bump them; 100-row batches are well-under the limit while still being efficient (3 round-trips for your library vs 228 individual inserts).

The error handling is honest: if a batch fails partway, the earlier batches are already committed. The next refresh picks them up. You'd see an error in the modal and could retry — the dedupe guard means you wouldn't re-insert what already landed.

---

## What changed in `data.ts`

Two new functions:

```ts
updateBookRead(id, patch)      // partial update — for the edit modal
bulkCreateBookReads(rows)      // batched insert — for the importer
```

Existing `createBookRead`, `listBookReads`, `deleteBookRead` are unchanged.

---

## Verification

| Check | Result |
|---|---|
| TypeScript compile | clean |
| Test suite | **316 / 316 passing** (25 new in `goodreadsImport.test.ts`) |
| Production build | clean (1,016 KB / 314 KB gzipped — +9KB JS / +2KB gz for the parser) |

I also ran a sanity check against your actual CSV (parsing only, no DB writes), confirming the numbers I quoted you above (228 read · 76 skipped · 6 fallback · 9 missing pages · 5 re-reads).

---

## What I deliberately didn't do

- **Auto-fill missing page counts via an API.** Considered hitting Open Library or Google Books for the 9 books with `pages = 0`, but: rate limits, accuracy varies (page counts differ across editions), needs API keys, and edition mismatches would silently produce wrong data. Easier and more accurate for you to look up the edition you actually read and edit by hand.

- **Multi-row re-reads in one import.** Goodreads' standard export only carries the most-recent Date Read regardless of Read Count. Without the historical dates in the source data, fabricating them is worse than just letting you add the second read manually via `+ Book` later.

- **Drag-and-drop file picker.** The `<input type="file">` works fine; drag-drop is nice-to-have polish that can come later if you find yourself importing often.

- **Progress bar inside the inserting phase.** With 228 rows in 3 batches of 100, the whole insert finishes in well under a second. A progress bar would mostly be invisible. If your library grows to 1000+ I'd add one.

- **Bulk delete after dry-run.** No "undo" for the import — but the dedupe makes it idempotent, so the worst case is "re-running does nothing." If you ever want a clean slate, you can delete books one-at-a-time via the existing `deleteBookRead` API (or via the edit modal if I add a delete button there later — it doesn't have one yet).
