# Daybook — Build 2 (the interaction layer)

**Date:** 2026-05-24
**Files modified:** 2
- `app/src/pages/Daybook.tsx` — drag-to-create, selection, double-click edit, hover tooltip
- `app/src/pages/Daybook.css` — `.selected`, `.db-draft`, `.db-tooltip` styles

The interaction layer for the Day view. Build 1 gave you a usable scheduler via the `+ Block` button; Build 2 makes the canvas itself respond to mouse — the way the design always intended.

---

## What shipped

### Drag-to-create

Mousedown on empty canvas → drag down → release. A dashed draft block follows the mouse, snapped to 15-minute boundaries, with a small pill showing the duration ("45m", "1h 30m", etc.) in the middle of the draft.

On release, the BlockModal opens **pre-filled** with the dragged start/end and the date you're viewing. Title is empty so you can type immediately; category defaults to the first one in your list.

If you just click without dragging more than 15 minutes, no modal opens — it's a deselect instead. The drag-vs-click distinction is by drag distance, not duration, so a fidgety click is never a false "create block" trigger.

**Implementation details:**
- Mousedown on the canvas captures the start Y, snaps to 15-min.
- `document.addEventListener('mousemove')` is attached for the duration of the drag — this means the mouse can leave the canvas and the drag still tracks correctly (instead of getting stuck).
- The mouse cursor changes from `crosshair` (empty canvas) to `ns-resize` (during drag) to `pointer` (over a block) so the affordance is discoverable without instructions.
- Existing blocks call `e.stopPropagation()` on their own mousedown so a drag doesn't start when you mean to click a block.

### Selection (single-click) with the 2px ink ring

Single-click on a block sets it as **selected** — a 2px ink ring appears around it, the block lifts slightly (box-shadow), and it sits above its neighbors via z-index. Selection lives in the page-level state, so it survives day navigation. Esc deselects.

**Double-click** opens the editor modal (same modal as `+ Block`, in edit mode). Selection clears when the modal opens so the ring doesn't compete visually with the modal's focus.

There's a brief "select → edit" flash on double-click because the browser fires `click` then `dblclick` for the same gesture. I tried delaying the select to disambiguate but it made single-click feel sluggish. The flash is a 380ms-or-less window and visually subtle; happy to revisit if it bothers you.

### Hover tooltip

Hover a block for 220ms → a 280px-wide paper-card tooltip slides next to it, showing:

- The **category name** in the category's color, JetBrains Mono uppercase
- The **title** in Newsreader 17px
- **Time range + duration** ("8:00 AM – 9:30 AM · 1h 30m") in JetBrains Mono
- **Notes** if present, separated by a dotted rule
- **Hint footer**: "Double-click to edit · Esc to deselect"

The 220ms delay is the handoff's spec — long enough that brief mouse-overs don't flicker, short enough to feel responsive when you actually stop on a block.

**Viewport flip**: positioned to the right of the block by default. If the tooltip would overflow the viewport's right edge, it flips to the left of the block. JS computes the position from `getBoundingClientRect` on mouse-enter.

**Scroll-cancels-tooltip**: the cached anchor rect would go stale on scroll, so any scroll inside the day-view container hides the tooltip immediately. Re-hover to bring it back.

**`pointer-events: none`** so the tooltip never gets in the way of a click on the block underneath.

### Esc handling

`Escape` deselects when there's no modal open. (Modals trap their own Esc to close themselves, so this only fires after they're already closed.)

---

## Architecture notes

The DayView component now carries three transient interaction states (drag, tooltip, plus the selection passed down from parent). It dispatches three callbacks to the parent for the persistent ones:

- `onSelectBlock(id)` — set / clear selection
- `onEditBlock(block)` — open the modal in edit mode (clears selection)
- `onCreateAtRange(startIso, endIso)` — open the modal in add mode pre-filled

The BlockModal already accepted `defaultStart` / `defaultEnd` from Build 1's `BlockModalState` type, so the create-at-range flow plumbs cleanly through without modal changes.

Two new internal components:
- **DraftBlock** — pure renderer for the in-progress drag visual. Hidden when drag distance is <15 minutes so a click doesn't flash a phantom tile.
- **BlockTooltip** — the hover info panel. Receives the precomputed `(x, y)` so positioning logic stays in DayView.

---

## What I deliberately deferred

- **Recurrence materialization** — moving to Build 3. A block stored with `recur: 'daily'` still doesn't show on future days yet; the `recur` field is preserved but not yet expanded at render time. The modal's "Repeat" chip still saves the field, you just can't see it act.
- **Hover affordance on selected blocks** — no inline edit/delete buttons appear when a block is selected. Currently the only way to edit is double-click (or the hover tooltip's hint message). Could add a small toolbar in Build 3.
- **Keyboard shortcuts beyond Esc** — `⌘C / ⌘V / ⌫ / D / 1/2/3 / arrow keys` all land in Build 5 alongside Pomodoro and Weekly Review.

---

## Verification

| Check | Result |
|---|---|
| TypeScript | clean |
| Test suite | **321 / 321 passing** |
| Production build | clean (1,060 KB / 325 KB gzipped — +3 KB JS for the new components) |
| New bundle hash | `index-CbPQ4l3L.js` |

---

## Try it

After the deploy, on the Daybook page:

1. **Drag** from any empty spot down a few hours — release, fill in the title, hit Create.
2. **Click** a block — it gets a thin black ring around it.
3. **Hover** for a moment — a tooltip with the full details appears next to it.
4. **Double-click** to edit.
5. **Esc** to clear the selection.

If the tooltip position feels off, or the 220ms delay feels too long/short, or the drag snap feels stiff — those are all single-constant tweaks. Tell me what feels wrong.
