# Life Board — Notes (Handoff)

This is a focused handoff for **just the Notes tab** — Life Board's Milanote
slice. The design file is the source of truth for look-and-feel; this README
tells you how to wire it to Supabase, what to keep, and what was deliberately
left out.

> **Design file:** `design/Notes.html` — open in a browser to see the exact
> visual target. Match the parchment palette, the type ramp, the toolbar
> chrome, the card hover/selection states, and the floating format toolbar
> pixel-for-pixel. Same palette as Sanctuary and Timeline — share the tokens
> across the three tabs.

---

## What you're building

A personal **infinite-canvas visual organizer**, narrowed to exactly the
Milanote behaviors the user uses:

- **Pan/zoom canvas**. Drag empty space to pan, ⌘/Ctrl + scroll to zoom around
  cursor, ordinary scroll to pan, dedicated zoom −/+/fit buttons. World extends
  to 12000×8000 px in the prototype — feel free to make it conceptually
  unbounded server-side.
- **Boards as nested folders**, not a tree sidebar. A "Board" card sits on the
  canvas as a colored tile; double-click enters it; breadcrumbs at the top
  navigate back. Boards can contain boards, recursively.
- **Six card types**: Note, To-do, Link, Heading, Board, Document.
- **Notes** with minimal-but-real formatting: bold/italic/underline, H1/H2,
  bullet/numbered/checkbox lists, blockquote, inline code, code blocks, links.
  Plus markdown shortcuts: `#` → H1, `##` → H2, `-` / `*` → ul, `1.`
  → ol, `>` → blockquote, \`\`\` → pre. Selection raises a floating
  toolbar.
- **Note → Document conversion prompt**: when a Note's plain-text length
  exceeds ~320 characters, a parchment-tinted prompt appears inside the card
  offering to convert it. "Keep as note" dismisses for that card.
- **Documents**: full-page editor in a roomy parchment overlay, opened on
  double-click. On the board they appear as a **collapsed icon** (default —
  140×110 paper-with-lines glyph + title) or as a **content preview card** with
  a 6-line excerpt. Toggle via the small "preview" / "icon" affordance on
  hover.
- **To-do cards**: title + checkbox list. Enter splits at caret; Backspace on
  an empty line deletes that line **into Trash, not into the void**.
- **Color swatches** per card via right-click → 7-color parchment-friendly
  palette (Paper / Saffron / Rose / Sage / Sky / Violet / Clay).
- **Trash drawer** (right side, opens from top bar). Every deletion goes here:
  whole cards *and* individual to-do lines. Each row shows type, time, preview,
  and Restore. **Nothing is permanently deleted.** No purge button — that's
  intentional per the spec.

---

## What's intentionally NOT here

Do not add these — the user asked for a small surface and meant it:

- Web clipping / browser extension
- Sketching / drawing canvas
- Image / video / audio uploads
- Real-time collaboration / presence / cursors
- Comments
- Templates
- Mobile sync (web only for now)
- Tags, search across boards, full-text search (can be added later if asked;
  do not ship in v1)

---

## Supabase schema

Three tables. Boards form a tree via `parent_id`; cards belong to a board and
carry their position + type-specific payload in JSONB.

```sql
create table if not exists notes_boards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references notes_boards(id) on delete cascade,  -- null = root
  name        text not null default 'Untitled board',
  -- visual properties of the board *tile* on its parent's canvas:
  tile_x      numeric not null default 0,
  tile_y      numeric not null default 0,
  tile_color  text    not null default 'paper',  -- swatch key
  tile_icon   text    not null default 'grid',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index notes_boards_user_parent_idx on notes_boards (user_id, parent_id);

create table if not exists notes_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  board_id    uuid not null references notes_boards(id) on delete cascade,
  type        text not null check (type in ('note','todo','heading','link','document')),
  x           numeric not null default 0,
  y           numeric not null default 0,
  w           numeric,
  h           numeric,
  z           int not null default 0,
  color       text not null default 'paper',
  -- type-specific fields live in payload:
  --   note:     { body: html }
  --   todo:     { title, items: [{ id, text, done }] }
  --   heading:  { body: text }
  --   link:     { title, url }
  --   document: { title, body: html, mode: 'icon' | 'preview' }
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index notes_cards_board_idx on notes_cards (board_id);

create table if not exists notes_trash (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- 'card' = a whole card was deleted; 'todo_item' = a single line removed from a to-do.
  kind          text not null check (kind in ('card','todo_item','board')),
  origin_board  uuid,                                  -- board the card was on
  origin_card   uuid,                                  -- for todo_item: parent to-do card
  snapshot      jsonb not null,                        -- enough to restore
  deleted_at    timestamptz not null default now()
);
create index notes_trash_user_idx on notes_trash (user_id, deleted_at desc);

-- RLS
alter table notes_boards enable row level security;
alter table notes_cards  enable row level security;
alter table notes_trash  enable row level security;
create policy "own" on notes_boards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on notes_cards  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on notes_trash  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Why JSONB for `payload`

Card types diverge a lot — a to-do has `items`, a document has a body and a
mode, a link has a URL. Putting type-specific fields in JSONB keeps the schema
small and makes new card types additive. Queries that only care about
position/type stay fast on top-level columns.

---

## TypeScript types

```ts
export type SwatchKey =
  | 'paper' | 'saffron' | 'rose' | 'sage' | 'sky' | 'violet' | 'clay';

export type CardType =
  | 'note' | 'todo' | 'heading' | 'link' | 'document';

export type Board = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  tile_x: number;
  tile_y: number;
  tile_color: SwatchKey;
  tile_icon: string;
  updated_at: string;
};

export type CardBase = {
  id: string;
  user_id: string;
  board_id: string;
  x: number; y: number;
  w?: number; h?: number;
  z: number;
  color: SwatchKey;
  updated_at: string;
};

export type NotePayload = { body: string /* html */ };
export type TodoPayload = {
  title: string;
  items: { id: string; text: string; done: boolean }[];
};
export type HeadingPayload = { body: string };
export type LinkPayload    = { title: string; url: string };
export type DocumentPayload = {
  title: string;
  body: string /* html */;
  mode: 'icon' | 'preview';
};

export type Card =
  | (CardBase & { type: 'note';     payload: NotePayload })
  | (CardBase & { type: 'todo';     payload: TodoPayload })
  | (CardBase & { type: 'heading';  payload: HeadingPayload })
  | (CardBase & { type: 'link';     payload: LinkPayload })
  | (CardBase & { type: 'document'; payload: DocumentPayload });

export type TrashEntry = {
  id: string;
  kind: 'card' | 'todo_item' | 'board';
  origin_board: string | null;
  origin_card: string | null;
  snapshot: any;     // shape depends on kind
  deleted_at: string;
};
```

---

## Endpoints / queries

```ts
// Load a board's contents (cards + immediate sub-boards)
const [{ data: cards }, { data: subs }] = await Promise.all([
  supabase.from('notes_cards').select('*').eq('board_id', boardId),
  supabase.from('notes_boards').select('*').eq('parent_id', boardId),
]);

// Persist a card move/resize (debounced; ~250ms after the user stops dragging)
await supabase.from('notes_cards').update({ x, y, w, h, updated_at: new Date() })
  .eq('id', cardId);

// Update a card's payload
await supabase.from('notes_cards').update({ payload, updated_at: new Date() })
  .eq('id', cardId);

// Soft-delete a card (insert into trash, then delete from cards)
const { data: card } = await supabase.from('notes_cards').select('*').eq('id', id).single();
await supabase.from('notes_trash').insert({
  kind: 'card', origin_board: card.board_id, snapshot: card,
});
await supabase.from('notes_cards').delete().eq('id', id);

// Restore from trash
const { data: t } = await supabase.from('notes_trash').select('*').eq('id', trashId).single();
if (t.kind === 'card') {
  await supabase.from('notes_cards').insert({ ...t.snapshot, board_id: t.origin_board });
} else if (t.kind === 'todo_item') {
  // append back to the to-do card's items array
  const { data: card } = await supabase.from('notes_cards').select('*').eq('id', t.origin_card).single();
  const items = [...(card.payload.items ?? []), t.snapshot];
  await supabase.from('notes_cards').update({ payload: { ...card.payload, items } }).eq('id', card.id);
}
await supabase.from('notes_trash').delete().eq('id', trashId);
```

Breadcrumbs need ancestors of the current board:

```sql
create or replace function notes_board_ancestors(target uuid)
returns setof notes_boards language sql stable as $$
  with recursive chain as (
    select * from notes_boards where id = target and user_id = auth.uid()
    union all
    select b.* from notes_boards b
    join chain c on b.id = c.parent_id and b.user_id = auth.uid()
  )
  select * from chain order by id;  -- order client-side along the chain
$$;
```

(Or load the whole tree once on app boot — the user's volume is small.)

---

## Behaviors worth getting right

A few things in the design file are easy to get wrong on a re-implement; copy
them straight rather than re-deriving.

### Card drag separates from text editing

Cards are draggable from anywhere *except* their editable bodies. Each card has
an invisible 14px-tall **drag handle** strip at the top so the user can grab
the card even when its content fills it. The mousedown handler bails out early
if the event originates inside `[contenteditable]`, `<input>`,
`<button>`, or `<a>`.

### The Note → Document prompt is sticky-but-dismissible

- Trigger: `stripTags(note.body).trim().length > 320`
- Show: an inline parchment prompt at the bottom of the note with two buttons:
  **Convert** and **Keep as note**.
- Dismiss: setting `payload.dismissedConvert = true` hides it permanently for
  that note (until the user clears it).
- Convert: change `type` from `note` → `document`, move `body` to
  `payload.body`, set `payload.mode = 'preview'`, derive a `title` from
  the first H1/H2 or the first sentence.

### To-do Backspace-on-empty goes to Trash

Standard Milanote-style "Enter splits, Backspace deletes" — but the deleted
line is recorded as a `todo_item` trash entry with `origin_card` set, so
restore puts it back in the same to-do card.

### Markdown shortcuts fire on space

Watch `keydown`, look at the current block's textContent, and rewrite the
block element when a sentinel matches. The design file lists the supported
sentinels — keep the list short on purpose.

### Floating format toolbar

Renders only on **non-collapsed selection** inside a Note's body. Position it
8px above the selection rect, clamped to the viewport. `mousedown` on a
toolbar button must call `preventDefault` so the selection is preserved when
the button fires.

### Right-click context menu

Right-click on any card opens the menu. Items `data-only="document"`, `...="board"`,
`...="note"` show only for matching card types. Color swatches always show.

### Color swatches

Stored as keys (`'paper'`, `'saffron'`, …), not hex. Map keys → CSS
variables in one place so theme changes touch one file. The exact hex values
live at the top of `Notes.html` under `:root` — copy them as design tokens.

### Pan / zoom math

The canvas uses `transform: translate(x,y) scale(k)`. Zoom-around-cursor
formula (don't reinvent):

```js
view.x = cx - ((cx - view.x) * (newK / view.k));
view.y = cy - ((cy - view.y) * (newK / view.k));
view.k = newK;
```

`cx, cy` are pointer coords relative to the canvas wrapper. Clamp `k`
between 0.2 and 2.5.

---

## Visual fidelity checklist

- **Fonts**: EB Garamond (body, 14–17px), Cormorant Garamond
  (headings/eyebrows, all caps, `letter-spacing: 0.22–0.32em`), JetBrains
  Mono for code.
- **Palette**: defined as CSS custom properties at the top of
  `design/Notes.html` — share tokens with Sanctuary and Timeline.
- **Card chrome**: 1px line border at `var(--line)`, hover bumps to
  `var(--line-strong)` and shadow grows. Selected state adds an
  `--accent`-colored 2px ring.
- **Card type tag**: small Cormorant pill above the top-left corner — only
  appears on hover/selected. Read-only label so the user always knows what
  type a card is.
- **Document icon**: a 40×50 paper rectangle with horizontal "lines" drawn via
  `::before` box-shadow stack — copy it verbatim, don't substitute an emoji
  or icon font.
- **Board tile**: 86×86 rounded-14px colored square; the tile color *is* a
  swatch key. Tile icon SVG drawn from the small icon set in `boardIcons`.
- **Trash drawer**: 360px, slides from right, top: 49px (under the ribbon),
  bottom: 28px (above the status bar). Empty state shows a centered italic
  message — keep it.

---

## Out-of-scope but worth thinking about for v2

If the user asks for these later, they slot in cleanly without schema rework:

- **Cross-board search** — `payload` columns are JSONB; add a generated
  `tsvector` column for full-text.
- **Tagging** — add a `tags text[]` column on `notes_cards` and a `tags`
  filter pill in the top bar.
- **Trash auto-purge** — currently nothing is purged; add a daily job after
  N days if the table grows.
- **Drag a card between boards** — the API is already there
  (`update notes_cards set board_id = ? where id = ?`); design needs a
  drop-target for breadcrumb items.
