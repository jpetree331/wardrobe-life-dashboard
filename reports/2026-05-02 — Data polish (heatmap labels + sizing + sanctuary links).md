# Data — polish pass (heatmap labels, dynamic sizing, sanctuary deep-links)

**Date:** 2026-05-02
**Files touched:** 2
- `app/src/pages/Data.tsx` — HeatGrid restructure, sanctuary deep-link in `ReadItem`
- `app/src/pages/Data.css` — single-grid heatmap rules, resize affordance, link + chip styling

Four small things you flagged after the Data room shipped, all real, all fixed.

---

## 1. Heatmap month labels were drifting away from their cells

**What you saw:** "Jan, Feb, Mar etc. is not near the correct squares. April squares have Jun over them for example."

**Root cause.** The heatmap used two separate CSS grids: one for the month-label row, one for the cell rectangle below it. They had different gap rules — `0` on the labels row, `3px` between cells — so every column the label row drifted 3 pixels left of the cells. By April (column ~13), accumulated drift was ~39px, about 3 cell-widths. The label that was supposed to point at April's cells visually appeared somewhere in March; the label that was supposed to point at June visually appeared above April.

The DST fix earlier today made this worse, because adding the prior-year overflow cells shifted everything one or two columns right while the label loop still emitted at the same column indices. So the misalignment that had probably always been minor became hard to ignore.

**Fix.** Restructured the whole HeatGrid into one CSS grid:

```
Column 1 = 30px gutter for dow labels
Columns 2..N+1 = week columns (1fr each)

Row 1 = month labels (only positioned in their respective week column)
Rows 2..8 = the seven dow rows
```

Month labels and cells now live in the same grid, sharing the same column sizing AND the same `gap: 3px`. They literally cannot drift apart — there's only one set of column tracks. Labels position via `gridColumn: m.col + 2` so they sit directly over the first cell of the week they label.

Bonus: the JSX is simpler. The old structure had a wrapper div, a nested grid for the body, two more grids (dow-labels and grid-cells) inside that. New structure has direct grid placement on every element via `gridRow` / `gridColumn` inline styles — no nested grids, no possibility of misalignment.

---

## 2. Heatmap was a fixed 12px-per-cell, not filling the page

**What you asked for:** "Make the heat map bigger so that it stretches dynamically to fill from left to right and can maybe be resized at the corners. Not super visibly, but there as an option."

**Fix — dynamic fill.** Switched the cell column template from `repeat(weeks, 12px)` to `repeat(weeks, minmax(0, 1fr))`. Cells now stretch to fill whatever space the parent provides. With a typical ~1100px content area on a 1280px-wide window, cells become roughly 19-20px each instead of 12px. On a 1920px monitor, ~28px each. They keep their square shape via `aspect-ratio: 1`, so heights track widths.

Also added `min-width: 0` on the heatmap-wrap's panel cell so it honors the grid's `1fr` instead of being forced to its intrinsic min-content width.

**Fix — subtle resize affordance.** Native CSS `resize: horizontal; overflow: hidden` on the heat grid. This adds the small diagonal handle in the bottom-right corner that you can drag if you want to shrink or grow the grid manually. Min width clamped to 480px so it can't degenerate to nothing. Almost invisible until you go looking for it — exactly what you asked for.

If the resize-handle approach doesn't feel right in practice (browsers vary), an alternative I held in reserve: a CSS variable `--cell-size` driven by JS measuring the container with ResizeObserver, with explicit pixel values you can adjust. Heavier code; cleaner control. I went with the native approach first since it's simpler and you said "not super visibly."

---

## 3. Book × Chapter — Sanctuary reads now deep-link

**What you asked for:** "Make it so in the Book × Chapter view, the Scripture showing the date read there is clickable somewhere to take one to the Sanctuary entry."

**How it works.** Sanctuary-derived reads carry their entry ID inside their synthetic record ID — the format is `sanctuary:<entry_uuid>:<ref_index>` (the `<ref_index>` distinguishes the case where one Sanctuary entry tags multiple passages). Sanctuary's page already supports a deep-link via `?id=<entry_uuid>` in the URL — `useSearchParams()` reads it and focuses that entry on load.

So the new behavior in the Reads pane:

- For **manual** scripture reads: the date is a plain non-clickable label (no Sanctuary entry to link to).
- For **sanctuary**-derived reads: the date becomes a `<Link to="/sanctuary?id=...">`, with a dashed underline on hover and a tooltip ("Open this Sanctuary entry"). Click → loads Sanctuary with that entry already focused.

The `sanctuary` chip's tooltip was updated to mention the click target ("click the date to open it") so the affordance is discoverable without being shouty.

This works because of the dual-source merge architecture from Build 1 — the `read.id` carries the entry ID through unchanged from `listSanctuaryScriptureReads` all the way to the Reads pane. No new data plumbing; just unpack the ID at render time.

---

## 4. The "S" in "sanctuary" was getting clipped

**What you saw:** "The 'S' in 'Sanctuary' is covered up when I look at it" (with screenshot showing the orange `sanctuary` label visually missing its leading character).

**Root cause.** The `read-source` element was an inline `<span>` with EB Garamond italic, sitting flush against the preceding text via flex `gap: 8px`. Italic Garamond's leading "S" has a slight negative side-bearing — its leftmost pixel column extends a hair to the left of the character's logical box. Combined with sub-pixel rendering at 10px font size, that overhang was getting clipped by the kerning of the larger "Psalms 45" text just before it (or by the line-wrap behavior when the row got crowded in the narrow 280px reads pane).

**Fix.** Promoted the label from a bare inline `<span>` to a small **chip**: subtle orange background (`color-mix(in oklab, #b8521a 10%, transparent 90%)`), 7px horizontal padding, 999px border-radius. The padding gives the italic letterforms unambiguous breathing room. The chip background also reads as an obvious metadata indicator (compared to the previous bare italic which could be misread as part of the reference).

Side benefits: `flex-shrink: 0` so the chip doesn't squish under crowding, and `white-space: nowrap` so the word always renders on one line.

The orange tone matches the existing Sanctuary calendar marker color (`#b8521a`), so the visual language stays consistent — sanctuary-flavored metadata = warm orange, anywhere it appears in the room.

---

## Verification

| Check | Result |
|---|---|
| TypeScript compile | clean |
| Test suite | **291 / 291 passing** (no test changes — these were all visual/structural) |
| Production build | clean (1,008 KB / 312 KB gzipped — unchanged) |

I also did a manual mental trace through the new heatmap structure: every cell in a 2026 grid (371 cells) sits at exactly `(c.weekIndex + 2, c.dow + 2)` in the parent grid; every month label sits at `(monthLabel.col + 2, 1)`. Labels and cells share the same column track and the same gap, so the alignment is now grid-enforced rather than dependent on matching pixel arithmetic across two grids.

---

## What I did NOT change

A few things I considered but left alone — happy to iterate:

- **Cell height across rows.** Rows are auto-sized; with `aspect-ratio: 1` and equal column widths, every cell is the same square so every row is the same height. No explicit row-template needed.

- **Year-rail proportions.** The year rail next to the heatmap stays at 80px wide. Could grow proportionally with the heat grid but felt better staying compact.

- **Chip color for non-sanctuary metadata.** Other small labels in the room (`Pace pill`, the `Soon` tab badges) use their own conventions and aren't unified with this chip. Leaving them as-is for visual variety; can revisit if it starts feeling inconsistent.

- **Sanctuary back-link.** When you click through to Sanctuary from the Reads pane, the URL has `?id=...` but Sanctuary doesn't currently show a "← back to Data" affordance. Could be worth adding if you start using this deep-link a lot.
