# Treasury — Build 2 (Sanctuary integration + extras)

**Date:** 2026-05-24
**Files added:** 2
- `app/src/components/TreasuryVerseModal.tsx` — extracted modal (shared by Treasury + Sanctuary)
- `app/src/components/TreasuryVerseModal.css` — modal-specific styles

**Files modified:** 4
- `app/src/pages/Treasury.tsx` — uses the extracted modal; verse cards now show a "from Sanctuary" badge when applicable
- `app/src/pages/Treasury.css` — removed duplicated modal styles; added `.vc-source` badge styling
- `app/src/pages/Sanctuary.tsx` — `✦ keep` button next to each scripture ref, modal mount, toast on save
- `app/src/pages/Sanctuary.css` — `.sa-refs li button.keep` and `.sa-keep-toast` styles

The Sanctuary → Treasury bridge ships. Search and sort-by-book were already in Build 1, so this build is two things: (1) one-click verse-keeping from Sanctuary entries, and (2) a back-link on Treasury cards so you can jump to the originating entry.

---

## What shipped

### `✦ keep` button in Sanctuary

In the Inspector panel under **Scripture References**, every ref now has a `✦ keep` button next to the existing `remove`. Clicking opens the Treasury "+ Keep verse" modal **pre-filled with**:

- `marked_on` = the Sanctuary entry's `entry_date` (the day you encountered it, not today)
- `reference` = the verbatim string from `scripture_refs`
- `translation` = ESV
- `source_entry_id` = the entry's UUID, persisted on save

`autoFetch={true}` is set on the modal, so it triggers an immediate `fetchScripture()` call as soon as it opens — by the time you've decided Stand-out vs Promise, the verse text is already populated. You can still re-Fetch if you switch translations.

The button uses a warm-gold color (`color-mix(in oklab, #a0700e 70%, var(--ink-soft) 30%)`) to read as creative rather than destructive, distinct from the `remove` button right next to it which still hovers red.

### Toast on successful keep

After save, a small toast appears bottom-center: *"✦ Kept John 3:16 in the Treasury. open Treasury →"*. The link in the toast jumps straight to `/treasury` so you can see your new entry among the others. The toast auto-dismisses after 3.5 seconds.

### `from Sanctuary` badge on Treasury cards

Every verse card whose `source_entry_id` is set now shows a small warm-orange chip in the card header: `from Sanctuary`. Clicking it navigates to `/sanctuary?id=<source_entry_id>` — Sanctuary already supports the `?id=` deep-link param (from a previous build), so it focuses the originating entry on load.

The chip is styled in the same `#b8521a` orange used by the Sanctuary calendar marker in the Data room — the visual cue "this came from Sanctuary" is consistent across the app.

`e.stopPropagation()` on the chip's onClick so it doesn't trigger the card's double-click-to-edit handler.

### Modal extracted to a shared component

`TreasuryVerseModal` and its styles now live in `src/components/`. Treasury and Sanctuary both import it; future surfaces (e.g. a Notes board, or a quick-action somewhere else) can use it the same way.

The component accepts:

```tsx
type Props = {
  initial?: TreasuryVerse;        // edit mode
  prefill?: {                      // add mode with prefilled values
    marked_on?: string;
    reference?: string;
    translation?: Translation;
    source_entry_id?: string;
    kind?: TreasuryKind;
  };
  autoFetch?: boolean;             // if true and reference is prefilled, fetch on mount
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
};
```

Treasury's use:
- Add: `<TreasuryVerseModal onClose={…} onSaved={…} />`
- Edit: `<TreasuryVerseModal initial={verse} onClose={…} onSaved={…} onDelete={…} />`

Sanctuary's use:
- Promote: `<TreasuryVerseModal autoFetch prefill={{ marked_on, reference, source_entry_id, translation: 'esv' }} onClose={…} onSaved={…} />`

The modal's CSS lives next to the component file and is imported from there, so wherever the modal renders, the styles come with it — no need to pull in Treasury.css for the modal to look right.

---

## How the data flows now

```
[Sanctuary entry with scripture_refs = ["Romans 8:38-39"]]
                    │
                    │  user clicks ✦ keep next to "Romans 8:38-39"
                    ▼
[TreasuryVerseModal opens]
   marked_on    = entry.entry_date
   reference    = "Romans 8:38-39"
   translation  = "esv"
   source_entry_id = entry.id
   (autoFetch fires) → verse_text populates from ESV
                    │
                    │  user picks Stand-out or Promise, maybe adds a note
                    ▼
[createTreasuryVerse] → INSERT INTO treasury_verses (..., source_entry_id = entry.id)
                    │
                    ▼
[Toast: "Kept Romans 8:38-39 in the Treasury."]

Later, on the Treasury page:
[Verse card for Romans 8:38-39]
   - has "from Sanctuary" chip in header
   - clicking it navigates to /sanctuary?id=<entry.id>
   - Sanctuary picks up ?id= via useSearchParams and focuses the entry
```

---

## Cosmetic details worth flagging

1. **Auto-fetch timing**: the modal does its fetch in a `useEffect` with an `useRef` guard so React strict-mode's double-mount doesn't trigger two API calls.

2. **Promise preview in the modal**: the Promise radio-row has a faint yellow background (`color-mix #f4d460 10%`) so the form previews the highlight you're about to apply. Carried over from Build 1; works identically in the extracted modal.

3. **Refs row alignment**: I added `align-items: baseline` and `flex: 1` on the ref text so the layout looks like `[ref ........ ✦ keep   remove]` — the keep button right-aligns just before remove, and the ref text takes the remaining horizontal space cleanly.

4. **Toast dismissal**: 3500ms is the sweet spot — long enough to read and click "open Treasury →", short enough not to nag. Click-through navigates and the toast disappears with the page transition.

---

## What I deliberately didn't do

- **No "already kept" indicator on the button.** If you ✦ keep the same ref twice (say from a Sanctuary entry that has multiple scripture refs you keep iteratively, then accidentally re-click one), you'll get two Treasury rows. They can be different — same verse, different notes, different kinds. Two rows is fine. If you accidentally created a dup, edit/delete from the Treasury room.
- **No batch keep.** One ref at a time. Sanctuary entries usually have a small number of refs; the batch UI would clutter for marginal benefit.
- **No removing the originating link if the Sanctuary entry is deleted.** The schema has `on delete set null` so if the source entry is removed, `source_entry_id` becomes null and the card just stops showing the "from Sanctuary" chip. The verse stays in the Treasury (where it belongs — it was kept).

---

## Verification

| Check | Result |
|---|---|
| TypeScript | clean |
| Test suite | **321 / 321 passing** (no new tests — same logic, just rewired UI) |
| Production build | clean (1,039 KB / 320 KB gzipped — ~+2 KB JS / +0 KB gz for the extracted-and-shared modal) |
| New bundle hash | `index-DQixmFap.js` (different from Build 1's `index-BciQQ-14.js`, so any cached old bundle is busted on the next deploy) |
| Strings in bundle | `✦ keep` and `from Sanctuary` both confirmed present |

---

## Treasury room status

After Build 2, the Treasury room is **feature-complete** for what we scoped:

- Schema + RLS ✓
- Chronological default, year dividers ✓
- Filter by kind (All / Promises / Stand-outs) ✓
- Sort by book (Genesis → Revelation) ✓
- Search across verse text + note ✓
- Promise highlight (faint yellow wash) ✓
- + Keep verse modal with ESV/KJV/etc. translation choice, parser-driven ref entry, fetch from API ✓
- Edit / delete affordances ✓
- 5th sphere in the Hallway ✓
- Sanctuary `✦ keep` promotion ✓
- `from Sanctuary` chip with click-through ✓
- Cross-room visual consistency (orange = Sanctuary-derived, yellow = promise) ✓

If anything in the actual feel of it nudges at you once you start using it (the toast position, the auto-fetch lag, the promise yellow intensity), the relevant CSS values are all easy to find — let me know.
