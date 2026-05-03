# Three small fixes — year-rail paging, rail width, Sanctuary refs

**Date:** 2026-05-03
**Files touched:** 3
- `app/src/pages/Data.tsx` — fix YearRail paging state-mgmt bug
- `app/src/pages/Data.css` — widen heatmap year rail; year+count inline
- `app/src/pages/Sanctuary.tsx` — render all scripture refs in meta line

Three caught-after-shipping fixes, each small but real.

---

## 1. Year rail couldn't page below 2022

### What you saw

Click `‹` → window goes from 2022-2026 to 2017-2021 visibly for a frame, then snaps back to 2022-2026. Stuck.

### Root cause

A `useEffect` in `YearRail` was watching both `value` (the active year) and `windowEnd` (the rightmost year of the visible window). Its job was to slide the window to include the active year if some other path (like clicking a row in the Years-in-Books retrospective) selected a year outside the visible range.

But because `windowEnd` was in the dep array, **every chevron click re-triggered the effect**:

```
User clicks ‹  →  setWindowEnd(2021)  →  effect re-runs
                                        →  value (2026) > windowEnd (2021)
                                        →  setWindowEnd(2026)  // snap back!
```

The bug never appeared until you tried to chevron back — clicking a year inside the visible window kept things consistent, hiding it.

### Fix

Use a ref to track the *previous* `value`, and only run the auto-shift logic when `value` actually changed (the original purpose of the effect). Chevron clicks change `windowEnd` but not `value`, so they no longer trigger the auto-shift.

```ts
const prevValueRef = useRef(value);
useEffect(() => {
  if (prevValueRef.current === value) return;
  prevValueRef.current = value;
  if (value > windowEnd) setWindowEnd(value);
  else if (value <= windowEnd - YEAR_WINDOW) setWindowEnd(value + YEAR_WINDOW - 1);
}, [value, windowEnd]);
```

Now both behaviors work correctly:
- Chevron paging through history: each click pages 5 years back, no auto-snap.
- Click a 2014 row in Years-in-Books retrospective → `value` updates → effect runs → window slides to 2010-2014 to show it.

This applies to **both** rails: Stats Books mode (where you noticed it) and Heatmap (where the same bug was lurking — same component, same broken effect).

---

## 2. Heatmap year rail too narrow — `(count)` was wrapping to a second line

The vertical year rail (next to the heatmap) was 80px wide with `flex-direction: column`, putting the year on top and the `(N)` count below it on a second line. Looked cramped.

Two changes:

- **Widened the rail to 110px** in `.dt-heatmap-wrap` (was 80px). Small bump but enough to fit "2026 (203)" on one line.
- **Year + count side by side** — switched the vertical-rail buttons to `flex-direction: row` (matching the horizontal rail), with `gap: 6px` between them. Bumped the count from 9px to 10px while I was in there for a slightly more readable proportion.

Now both rails (vertical heatmap, horizontal Stats) look the same per row: `2026 (45)` on a single line.

---

## 3. Sanctuary — second scripture reference didn't render under the title

### What you saw

When you tag a Sanctuary entry with a second `scripture_refs` value, it doesn't appear in the meta line under the title. Only the first one shows.

### Root cause

In `Sanctuary.tsx` line 1077, the rendering hardcoded `.slice(0, 1)`:

```tsx
{(active.scripture_refs || []).slice(0, 1).map((r) => (
  <span key={r} style={{ display: 'contents' }}>
    <span className="pip">✦</span>
    <span>{r}</span>
  </span>
))}
```

I'd guess this was leftover from when the meta line only supported a single ref, and it never got updated when multi-ref support landed. The `.map` loop was already correct shape — each ref gets its own `✦` separator pip — only the artificial slice was holding it back.

### Fix

Drop the `.slice(0, 1)`:

```tsx
{(active.scripture_refs || []).map((r) => (
  <span key={r} style={{ display: 'contents' }}>
    <span className="pip">✦</span>
    <span>{r}</span>
  </span>
))}
```

Now the meta line shows all refs:

```
✦ Devotional ✦ 2026-04-27 ✦ Mon ✦ Psalms 45 ✦ Isaiah 6
```

The detail panel below the entry (line 1361, `active.scripture_refs.map(...)` without slice) was already correct — both views now stay in sync.

---

## Verification

| Check | Result |
|---|---|
| TypeScript compile | clean |
| Test suite | **321 / 321 passing** |
| Production build | clean (1,027 KB / 317 KB gzipped — no change) |

The bugs were all behavior-only (no algorithmic changes), so no test additions. The existing tests still cover the year-rail count derivation and the sanctuary scripture-ref synthesis path.
