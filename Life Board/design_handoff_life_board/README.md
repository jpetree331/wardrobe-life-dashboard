# Handoff: Life Board — Hallway & Sanctuary

## Overview

**Life Board** is a personal mind-palace web app for contemplative practice, study, and creative work. The user enters through a **Hallway** (the landing page — four glowing spheres arranged like a pawprint) and from there steps into rooms. This handoff covers the first two:

1. **Hallway** — landing page; four named "doors" (spheres). Click one to enter that room.
2. **Sanctuary** — the central, sacred room: a Scrivener-style journaling environment for prayer, Scripture reading, Lectio Divina, examen, and journal entries.

The other three doors (Timeline, Wonder Room, Workshop) are not yet designed and are out of scope for this handoff.

The aesthetic is contemplative and tactile — warm parchment palette, transitional serif type (EB Garamond / Cormorant Garamond / Sorts Mill Goudy), restrained ornamentation, no emoji, no AI-slop tropes (no neon gradients, no glassmorphism, no rounded-corner cards with left-border accents).

---

## About the Design Files

The files in `design_files/` (`Hallway.html` and `Sanctuary.html`) are **design references created in HTML** — fully working prototypes that demonstrate the intended look, motion, and behavior. They are **not production code to ship directly**.

Your task is to **recreate these designs in the target codebase**, using its established stack, components, design tokens, routing, persistence, and conventions. If no codebase exists yet, choose an appropriate framework (React + a small router + a CSS-in-JS or Tailwind setup are all reasonable) and implement there.

The HTML uses inline styles and vanilla JS for portability. In a real codebase you'll want:
- A real component library (the Sanctuary toolbar, binder, inspector tabs, and tweak panel are all reusable components)
- Real persistence (entries should live in a database, not a JS array; tweak settings in user preferences)
- Real Scripture fetching (the prototype already calls `bible-api.com` — keep this for public-domain translations; add a licensed API for ESV/RSVCE/NRSV later)
- Real auth scoping if this becomes multi-user

---

## Fidelity

**Mid-fidelity, leaning hi-fi.** Colors, typography, spacing, and interactions are deliberate and tuned. Use the exact tokens listed below. The Hallway is intentionally restrained; the Sanctuary is more functional but still text-forward.

---

## Screens

### 1. Hallway (`design_files/Hallway.html`)

**Purpose:** The landing page. Four spheres labeled with the room names. Hovering warms a sphere. Clicking it expands the sphere outward to fill the viewport, then reveals a "threshold" overlay that fades in with the room name. From the threshold, a "← return to the hallway" button restores the hallway. Pressing Escape also returns.

**Layout:** Full-viewport stage. The spheres sit on an invisible 16:12 canvas centered horizontally and vertically.

**Sphere positions (CSS):**
- **Wonder Room** (small, top-center) — `left: 50%; top: 12%; transform: translateX(-50%)`
- **Timeline** (small, top-left) — `left: 16%; top: 22%`
- **Workshop** (small, top-right) — `right: 16%; top: 22%`
- **Sanctuary** (large, center, directly under Wonder Room) — `left: 50%; top: 58%; transform: translate(-50%, -50%)`

**Sphere sizes:**
- `.sphere.big` — `width: 30%; aspect-ratio: 1`
- `.sphere.small` — `width: 18%; aspect-ratio: 1`
- Sanctuary's exact size is also exposed as a Tweak (range 22–40% width).

**Sphere style:**
- Transparent fill, 1.4px solid `var(--ink)` border
- Inner ring at `inset: 3px`, 0.6px solid `var(--ink-soft)`, opacity 0.35 base
- Label is centered, `Cormorant Garamond` 400. Big spheres ~24–34px clamp, small ~13–18px clamp. `letter-spacing: 0.04em`.
- Subtitle (`.sub`) is `EB Garamond` italic, hidden by default; opacity → 1 on hover with a small downward translate of 2px → 0.

**Ambient breathing halo (always running):**
- A `::before` pseudo-element behind each sphere
- `inset: -12%`
- Background: `radial-gradient(closest-side, rgba(var(--glow), 0.35), rgba(var(--glow), 0) 70%)`
- `filter: blur(6px)`
- Animation: `breathe` 9s ease-in-out infinite — scale 0.92 → 1.12, opacity 0.25 → 0.7

**Cursor proximity warmth:**
- On `mousemove`, compute distance from cursor to each sphere center
- Set CSS var `--prox` to `(1 - d / 280)²` clamped 0–1
- Halo opacity = `0.35 + var(--prox) * 0.55`
- Inner ring opacity = `0.35 + var(--prox) * 0.35`

**Hover state:**
- Glow box-shadow: `0 0 110px 18px rgba(var(--glow), 0.6), inset 0 0 80px 0 rgba(var(--glow), 0.5)`
- Background fades to `color-mix(in oklab, var(--bg-2) 55%, transparent)`
- Slight scale-up (1.02 / 1.03 depending on size class)
- Subtitle becomes visible

**Click → Threshold transition:**
1. Body gets `.entering` class — non-clicked spheres fade to opacity 0.08 + blur(6px) over 1200ms; seal/epigraph/archline fade out
2. Clicked sphere gets `.is-entering` class:
   - Inner text (`.inner`) opacity → 0 over 500ms (prevents blur during scale — important; this is the fix for a real bug)
   - Border fades out
   - Background becomes a glowing radial gradient
   - Inline transform translates sphere center to viewport center and scales it to `Math.hypot(vw, vh) * 1.1 / sphereWidth`
   - Transition duration: **5200ms cubic-bezier(.25, .5, .2, 1)** (deliberately slow — feels like crossing a threshold)
3. After 3200ms, `.threshold` overlay (radial-gradient backdrop with the glow color) fades in over 3200ms
4. Threshold shows: small "ENTERING" eyebrow → large room name in Cormorant Garamond → small italic sub → "← return to the hallway" button (button fades in last, at +1400ms)
5. Esc or button click restores: removes `.is-entering`, clears inline transform, restores layout

**Other Hallway elements:**
- **Date seal** — top-left, 84×84px circle, 1.2px ink-soft border, dashed inner ring, tilted -6deg. Shows month abbrev / day / "A·D YYYY". Calculated from `new Date()`.
- **Archline** — faint dashed SVG path arching above the spheres. Opacity 0.5, can be toggled via Tweak.
- **Epigraph** — bottom of viewport, italic EB Garamond 15px ink-faint. Default text: `"Be still, and know."` Editable via Tweak.

**Entrance animation (page load):**
- `@keyframes dawn` — opacity 0 → 1 with `filter: blur(8px) → blur(0)` over 1800–2400ms
- Staggered delays so the spheres dawn in: Wonder 250ms → Timeline 600ms → Workshop 900ms → Sanctuary 1200ms

**Reduced motion:**
- `@media (prefers-reduced-motion: reduce)` — disable breathing, shorten transitions to 300ms, neutralize `dawn` keyframes

---

### 2. Sanctuary (`design_files/Sanctuary.html`)

**Purpose:** The journaling room. Scrivener-style binder/editor/inspector. Supports two layout modes: Single (binder + editor + inspector) and Scripture + Prayer (binder + editor + scripture/inspector tabbed pane on the right).

**Top-level layout (CSS grid on `body`):**
- `grid-template-rows: auto 1fr auto` (ribbon · main · status)
- The middle row is its own grid (`.body-grid`):
  - Single mode: `280px 1fr 280px`
  - Dual mode: `280px 1fr 1fr 0` (inspector hidden; scripture pane revealed)

**Ribbon (top):**
- 14px 24px padding, `var(--bg-2)` background, 1px ink-translucent bottom border
- Left side: "← hallway" link (italic), "SANCTUARY" wordmark in Cormorant Garamond uppercase tracked 0.32em, then a small dot + liturgical season + today's date
- Right side: mode toggle pill (`Single` / `Scripture + Prayer`) — pill background `var(--bg)`, active button has ink fill and bg-color text, all caps, tracked 0.12em

**Binder (left, 280px):**
- Background `var(--panel)`, 1px right border
- Panel head: "BINDER" label in Cormorant Garamond + a "+ new" button on the right
- **Flat chronological list** of entries — no folders, no grouping
- Each entry: `<li>` with a tabular date prefix in `var(--ink-faint)` then title in `var(--ink-soft)` (becoming `var(--ink)` when active or hovered)
- Title format: `YEAR-MONTH-DAY. TITLE` — the period separator and the space after it are mandatory
- Active entry: 2px left accent border in `var(--accent)` color, slight tinted background
- Footer with "Search" and "Sort: newest" buttons (placeholder UX; wire up search later)

**Editor (center):**
- Toolbar (top of column) — see below
- Editor pane: scrollable, soft radial-gradient bg
- "Page" — max-width 700px, parchment-tone background (`var(--page)`), heavy paper-shadow stack:
  - `0 1px 0 rgba(0,0,0,0.02)`
  - `0 24px 60px -30px rgba(43, 36, 25, 0.25)`
  - `0 2px 10px -4px rgba(43, 36, 25, 0.08)`
  - 1px border `#e4d8bf`
- Padding: `48px 56px 80px`
- The `.title` (h1) is `Cormorant Garamond` 400, 32px, contenteditable
- The meta line is italic EB Garamond 13px ink-faint, with small `✦` pip dividers in `var(--accent)`, separated by 12px gap; bottom border 1px ink-translucent

**Editor toolbar groups (left-to-right):**
1. **Font + size** — `<select>` with EB Garamond / Cormorant / Sorts Mill Goudy / Georgia / Iowan-Palatino. `−` button, number input (12–36), `+` button.
2. **Inline formatting** — Bold (B, weight 600), Italic (I, italicized), Underline (U), Strikethrough (S̶), Highlight (H button itself filled with the highlight color), Red-letter (✝ glyph in red — wraps selection in `.red-letter`).
3. **Block + special** — Heading (H), Blockquote (❝), Drop cap (Ɒ — toggles `.dropcap` on the current `<p>`), Verse number (1 — prompts and inserts `<span class="verse-num">N</span>`), Rubric (R — wraps in `.rubric` for liturgical small-caps red).
4. **Spacer + saved-at** — italic "saved just now"

Toolbar button states use `aria-pressed="true"` (background `var(--bg-3)`). Document.execCommand is used for bold/italic/underline/strikethrough/formatBlock/hiliteColor; custom code wraps for redLetter, rubric, dropcap, verseNum.

**Page formatting tokens:**
- `mark` (highlight): `var(--hi)` background = `rgba(218, 181, 86, 0.35)`
- `.rubric`: color `var(--red)` = `#8a2a1a`, `font-variant: small-caps`, `letter-spacing: 0.08em`
- `.verse-num`: Sorts Mill Goudy, `var(--accent)` = `#7a6a3a`, 0.78em, vertical-align super
- `.red-letter`: `var(--red)`
- `blockquote`: 2px left border in `var(--accent)`, italic ink-soft, 20px left padding
- `.dropcap::first-letter`: Sorts Mill Goudy, 4.2em, float left, line-height 0.85, padding `6px 10px 0 0`, color `var(--accent-strong)` = `#9c8240`

**Scripture pane (right, dual mode only):**
- Background uses `var(--scripture-bg)` (defaults to `var(--page)`)
- Header has two parts stacked vertically (10px padding, gap 8px):
  1. **Tabs row**: "Scripture" / "Inspector". Cormorant Garamond, tracked 0.22em, uppercase. Active tab has `border-bottom: 1.5px solid var(--accent)` and color `var(--ink)`.
  2. **Controls row** (visible only when Scripture tab is active): translation `<select>`, ref `<input>`, `Open` button.
- Scripture body: padding `40px 48px 80px`, `Sorts Mill Goudy` 17px / line-height 1.75
- Verse numbers: `.vnum` — Sorts Mill Goudy, 0.78em super, color `var(--accent)`
- Source line at bottom: italic EB Garamond 12px ink-faint, dashed top border. Format: `Source: bible-api.com · {translation} · unmodified public-domain text.`
- "Inspector tab content in pane" — same content as the right-side inspector but visible inside the scripture pane when the Inspector tab is active

**Translations (in `<select>`):**
- Enabled (public domain, fetched from `bible-api.com`): KJV, WEB, ASV, BBE, Darby, Young's Literal
- Disabled with explanatory note: ESV, RSVCE, NRSV — copyrighted, license required
- The disabled options exist so the UI is forward-compatible: when a publisher license is acquired, swap the fetch endpoint and enable them.

**Selection toolbar (Scripture only):**
- Floating dark pill that follows the user's text selection inside `.scripture-body`
- Two buttons: "Highlight" (wraps selection in `<span class="sc-highlight">` with the highlight color) and "Copy" (writes selection.toString() to clipboard, shows "Copied" for 1.2s)
- Position: `top = rect.top - 38 + scrollY`, `left = rect.left + rect.width/2 - 70 + scrollX`
- Hidden when selection is empty or outside the scripture body

**Inspector (right column, single mode only):**
- Three sections, each with an h3 in Cormorant Garamond 12px tracked 0.24em uppercase:
  - **Entry**: Created · Words · Season (italic ink-faint key, ink value)
  - **Tags**: pill-style spans, italic, 1px ink-strong border, rounded 999px, 12px font, "+ add" affordance
  - **Scripture References**: dashed-bottom list items
- *The Companion section was removed at the user's request.*

**Status bar (bottom):**
- 6px / 20px padding, bg-2 background, top border
- Italic EB Garamond 12px ink-faint
- Left: current entry path (`Sanctuary · Lectio Divina · 2026-04-19. Emmaus Road`)
- Right: word count · saved time · rotating contemplative epigraph

---

## Tweaks Panel (Sanctuary)

A 300px floating panel pinned bottom-right, hidden by default. The host toggles it via `postMessage({type: '__activate_edit_mode'})` / `'__deactivate_edit_mode'`. The panel surface is `var(--bg-2)` with a 1px ink-strong border and a soft 14px shadow.

Three sections:

### 1. Themes (one-click presets)

Six chips in a 2-column grid, each a small swatch + name:

| Theme | Cream | Light |
|---|---|---|
| Snow | 8 | 92 |
| Linen | 25 | 80 |
| Parchment | 55 | 65 |
| Vellum | 75 | 55 |
| Candlelit | 80 | 35 |
| Dusk | 35 | 30 |

Active chip has a `var(--accent-strong)` border. Clicking a chip sets both sliders and applies the palette.

### 2. Sliders

- **Creaminess** (0–100): chroma scales `c * 0.052`, hue scales `70 + c * 14` — at 0, the palette is nearly neutral; at 100 it's a warm parchment.
- **Lightness** (0–100): `Lbg = 0.84 + l * 0.13` (so 0.84..0.97 OKLCH lightness). Other surfaces derive from Lbg.

When either slider is moved, the active theme chip de-selects (drift detection).

### 3. Custom Colors (in `<details>`)

Five color pickers + reset buttons:
- Background → `--bg`
- Side panels → `--panel`
- Journal page → `--page`
- Scripture page → `--scripture-bg` (also assigns `.scripture-pane` and `.scripture-body` background to this var inline)
- Ink (text) → `--ink`

Each picker, when set, overrides the slider-derived value for that surface only. Reset clears the override and the slider value reasserts.

---

## Persistence (Tweaks)

In the prototype, the panel posts `__edit_mode_set_keys` to the parent on every change, which writes back to a JSON block in the file:

```js
const TWEAKS = /*EDITMODE-BEGIN*/{
  "theme": "parchment",
  "cream": 55,
  "light": 65,
  "customBg": null,
  "customPanel": null,
  "customPage": null,
  "customScripture": null,
  "customInk": null
}/*EDITMODE-END*/;
```

In the production app, store this on the user's preferences (Tailwind variables, CSS custom properties on `:root`, or a theme provider). The keys above are the canonical shape.

---

## Interactions & Behavior

### Hallway

- **Hover** — warm glow + subtitle appears
- **Cursor proximity** — non-hovered spheres warm gradually as cursor approaches
- **Ambient breathing** — 9s loop, always running (unless reduced motion)
- **Click sphere** — 5.2s expand to viewport, threshold overlay fades in, room name + return button
- **Esc or click "← return"** — restores hallway
- **Reduced motion** — disable breathing + shorten transitions

### Sanctuary

- **Mode toggle** — switches grid template; in dual mode, fetches the current Scripture reference if not already loaded
- **Binder entry click** — sets the page title to `${date}. ${title}` (in production: load full entry content from DB)
- **Pane tabs (dual mode)** — Scripture or Inspector; controls row hides when Inspector tab is active
- **Translation change / Open / Enter in ref input** — fetches passage from `https://bible-api.com/${ref}?translation=${tr}`
- **Toolbar buttons** — apply selection-based formatting (see toolbar groups above)
- **Font size** — `[12, 36]` int range
- **Selection in scripture body** — floating Highlight + Copy toolbar
- **Tweaks** — see above

### Bible API

```
GET https://bible-api.com/Luke 24:13-35?translation=kjv

→ {
  reference: "Luke 24:13-35",
  verses: [{ book_id, book_name, chapter, verse, text }],
  text: "...",
  translation_id: "kjv",
  translation_name: "King James Version",
  ...
}
```

Free, public-domain only. For ESV, RSVCE, NRSV: contact publishers (Crossway, NCC) for a license; the UI is already structured to accept additional translation IDs.

---

## State Management

### Hallway
- `entering: boolean` — whether the threshold transition is active
- `currentRoom: string | null`
- `cursorPosition` — for proximity warmth (transient, not persisted)

### Sanctuary
- `entries: Entry[]` — chronological, newest first. Schema: `{ id, date: 'YYYY-MM-DD', title, body: string (rich text), tags: string[], references: string[], type: 'prayer' | 'scripture' | 'lectio' | 'examen' | 'journal' | null, createdAt, updatedAt }`
- `activeEntryId`
- `mode: 'single' | 'dual'`
- `paneTab: 'scripture' | 'inspector'`
- `scripture: { translation, ref, content, source, loading, error }`
- `tweaks: { theme, cream, light, customBg, customPanel, customPage, customScripture, customInk }`
- `font: { family, size }`

### Persistence priorities
1. Entries — must persist (DB or local-first sync)
2. Tweaks — must persist (user preference)
3. Scripture highlights — should persist per `(translation, reference)` (in prototype, session-only)
4. Last opened entry, scroll position — nice to have

---

## Design Tokens

### Colors (defaults — will be overridden by Tweaks)

```css
--bg:        #efe7d6;   /* parchment background */
--bg-2:      #e4d8bf;   /* slightly deeper parchment for ribbons/footers */
--bg-3:      #d8caa8;   /* deeper still — used for active states */
--panel:     #ece3cf;   /* panel surface */
--page:      #f6efde;   /* the writing surface (lifts above bg) */
--ink:       #2b2419;   /* primary text */
--ink-soft:  #5a4f3c;   /* secondary text */
--ink-faint: #8a7d63;   /* tertiary text, captions, dates */
--line:      #2b241933; /* hairline (20% ink) */
--line-strong: #2b241955; /* stronger hairline (33% ink) */
--accent:    #7a6a3a;   /* soft gold — pips, accents, active borders */
--accent-strong: #9c8240; /* strong gold — drop caps, selected borders */
--red:       #8a2a1a;   /* rubric red — for Christ's words and headings */
--glow:      255, 224, 150; /* RGB triplet — used in rgba() for warm glow */
--hi:        rgba(218, 181, 86, 0.35); /* highlight wash */
```

In OKLCH (for the Tweaks engine):
- All warm surfaces sit at hue ~70–84
- Chroma ranges 0.0 → 0.052
- Lightness ranges 0.81 → 0.97 for backgrounds, 0.20 → 0.25 for ink

### Typography

```
EB Garamond           — body text (400, 500, italic 400/500)
Cormorant Garamond    — labels, headings (300, 400, 500, 600, italic 400)
Sorts Mill Goudy      — Scripture body, drop caps, verse numbers (italic 0/1)
Caveat                — reserved (handwriting accents — not currently used in Sanctuary; available)
```

All loaded via Google Fonts. Body family stack: `'EB Garamond', Georgia, serif`.

Type scale used in Sanctuary:
- Page body: 17px (user-adjustable 12–36) / line-height 1.65
- Page title (h1): Cormorant Garamond 400, 32px, letter-spacing 0.02em
- Meta line: 13px italic, letter-spacing 0.04em
- Panel labels (h2): Cormorant Garamond 13px, letter-spacing 0.24em, uppercase
- Inspector h3: Cormorant Garamond 12px, letter-spacing 0.24em, uppercase
- Status bar: 12px italic, letter-spacing 0.04em
- Ribbon wordmark (`SANCTUARY`): Cormorant Garamond 16px, letter-spacing 0.32em, uppercase

### Spacing
- Page padding: 48px 56px 80px
- Editor pane padding: 40px 40px 80px
- Panel head padding: 14px 18px 10px
- Toolbar padding: 10px 20px
- Status bar padding: 6px 20px

### Borders & Radii
- Hairlines: 1px solid `var(--line)`
- Stronger separators: 1px solid `var(--line-strong)`
- Sphere border (Hallway): 1.4px solid `var(--ink)`
- Toolbar buttons: border-radius 2px (low; this UI avoids the rounded-card trope)
- Tag pills, mode toggle: border-radius 999px (only place pill rounding is used)
- Threshold return button border-bottom: 1px solid `var(--line)`

### Shadows
- Page shadow stack (parchment lift):
  - `0 1px 0 rgba(0,0,0,0.02)`
  - `0 24px 60px -30px rgba(43, 36, 25, 0.25)`
  - `0 2px 10px -4px rgba(43, 36, 25, 0.08)`
- Tweaks panel: `0 14px 40px -20px rgba(43, 36, 25, 0.35)`
- Sphere hover glow: `0 0 110px 18px rgba(var(--glow), 0.6), inset 0 0 80px 0 rgba(var(--glow), 0.5)`
- Sphere is-entering glow: `0 0 220px 60px rgba(var(--glow), 0.7), inset 0 0 140px 0 rgba(var(--glow), 0.7)`

### Motion

| Effect | Duration | Easing |
|---|---|---|
| Hallway dawn (entrance) | 1800–2400ms | ease-out |
| Sphere breathing | 9s | ease-in-out, infinite |
| Hover glow | 700–900ms | ease |
| Click → expand | 5200ms | cubic-bezier(.25, .5, .2, 1) |
| Threshold backdrop fade | 3200ms | ease |
| Threshold word/button fade-in | 1400ms | ease-out |
| Section/cell fades in Sanctuary | 800ms | ease-out |
| Generic UI transitions | 150–300ms | ease |

Reduced-motion: collapse breathing, drop transitions to ≤300ms.

---

## Assets

- **Fonts** — Google Fonts: EB Garamond, Cormorant Garamond, Sorts Mill Goudy, Caveat (Caveat reserved for future use)
- **No images, no icons.** All UI is type + shape. Glyphs used: ✦ (six-point pip), ✝ (red-letter button), ❝ (blockquote button), ▾ (folder chevron — currently unused after binder flatten), ▾/+/− (size buttons). All Unicode, no icon library required.
- **No emoji.**

---

## Files

- `design_files/Hallway.html` — landing page prototype
- `design_files/Sanctuary.html` — Sanctuary room prototype (binder + editor + inspector + scripture + tweaks)

Both are self-contained: HTML + inline `<style>` + inline `<script>`, plus a Google Fonts `<link>`. Open either in a browser to see the working prototype.

---

## Out of Scope (for now)

- Timeline, Wonder Room, Workshop rooms (not designed yet)
- Authentication, multi-user, sync, sharing
- Catholic deuterocanon / licensed translations (UI ready, integration pending)
- Mobile / responsive breakpoints below ~900px viewport — current layout assumes desktop. The Hallway scales to viewport; the Sanctuary three-column grid will overflow on mobile and needs a mobile design pass.
- The other three rooms' rooms-from-Hallway transitions wire up — currently all four spheres animate identically; in production, each click should route to that room's URL.

---

## Implementation Notes

- **Don't reuse the prototype's `document.execCommand` rich-text** in production — it's deprecated. Use a real rich-text editor (TipTap, Lexical, Slate). The toolbar set above maps cleanly onto TipTap's marks/commands.
- **Don't reuse the inline color tokens** as hex codes — port them to CSS custom properties (or Tailwind theme extensions) keyed off the Tweaks state. The OKLCH derivation in `applyPalette()` is the authoritative one; the hex defaults are fallbacks.
- **The `bible-api.com` fetch is fine for production for public-domain texts.** Cache responses; rate-limit; surface "Source: ..." in the UI to make Scripture provenance legible (this matters to the user).
- **Sanctuary entries should not be split into folders.** The user explicitly wanted one chronological list — they often combine prayer and Scripture reading in a single entry.
- **The "Companion" (AI) panel was removed.** Sanctuary is solitary by design. Don't reintroduce AI features here without an explicit ask.
- **Tweaks panel** — when porting to React, `useTweaks` hook should expose `{ tweaks, setTweak }`; the `applyPalette` function should be a `useEffect` that sets CSS custom properties on `document.documentElement`.
