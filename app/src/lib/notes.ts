// Typed CRUD for the Notes room. Three tables (notes_boards, notes_cards,
// notes_trash) — see supabase/migrations/0004_notes.sql for the schema.
//
// Boards form a tree. Each user has exactly one root board (is_root=true);
// nested boards have parent_id set. Cards live on a board; the special
// 'board' card type is a tile that points at another board via board_ref.

import { supabase } from './supabase';
import { removeStorageObjects } from './notesMedia';
import { collectMediaPaths, remapBoardSnapshot, type BoardSnapshot } from './notesTrashRestore';

export type SwatchKey =
  | 'paper' | 'saffron' | 'rose' | 'sage' | 'sky' | 'violet' | 'clay';

export const SWATCHES: SwatchKey[] = [
  'paper', 'saffron', 'rose', 'sage', 'sky', 'violet', 'clay',
];

export type CardType =
  | 'note' | 'todo' | 'heading' | 'link' | 'document' | 'board'
  | 'image' | 'file' | 'column' | 'swatch' | 'comment';

export type Board = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  tile_x: number;
  tile_y: number;
  tile_color: SwatchKey;
  tile_icon: string;
  is_root: boolean;
  starred: boolean;
  created_at: string;
  updated_at: string;
};

export type TodoItem = { id: string; text: string; done: boolean };

export type ImagePayload = {
  storagePath: string;      // original, in the notes-media bucket
  thumbPath?: string;       // downscaled canvas rendition (large originals)
  caption?: string;
  naturalW: number;
  naturalH: number;
};

export type LinkPayload = {
  title: string;
  url: string;
  // Metadata fields (Sprint 7) — additive; old cards simply lack them.
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
  fetchedAt?: string;
};

export type FilePayload = {
  storagePath: string;      // notes-media bucket
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export type CardPayload =
  | { body: string }                                                   // note, heading
  | { title: string; items: TodoItem[] }                               // todo
  | LinkPayload                                                         // link
  | { title: string; body: string; mode: 'icon' | 'preview' }          // document
  | { name: string }                                                   // board tile mirror
  | ImagePayload                                                        // image
  | FilePayload                                                         // file
  | ColumnPayload                                                       // column
  | Record<string, unknown>;                                            // catch-all

export type ColumnPayload = {
  title: string;
  collapsed?: boolean;
};

export type SwatchCardPayload = {
  hex: string;
  label?: string;
};

export type CommentPayload = {
  body: string;
  resolved?: boolean;
};

export type Card = {
  id: string;
  user_id: string;
  board_id: string;
  type: CardType;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  z: number;
  color: SwatchKey;
  payload: CardPayload;
  board_ref: string | null;     // populated when type='board'
  // Column containment (Sprint 8): a card with parent_column set lives
  // inside that column card at column_index and ignores its x/y.
  parent_column: string | null;
  column_index: number | null;
  created_at: string;
  updated_at: string;
};

export type TrashEntry = {
  id: string;
  user_id: string;
  kind: 'card' | 'todo_item' | 'board' | 'column' | 'arrow';
  origin_board: string | null;
  origin_card: string | null;
  snapshot: any;
  deleted_at: string;
};

export type ArrowStyle = { dashed?: boolean };

export type Arrow = {
  id: string;
  user_id: string;
  board_id: string;
  from_card: string;
  to_card: string;
  label: string;
  style: ArrowStyle;
  created_at: string;
  updated_at: string;
};

/**
 * Translate common Supabase/Postgres failures into actionable messages —
 * above all the "pending migration" cases, which otherwise fail silently
 * enough to look like the UI doing nothing. Returns null when the error
 * isn't one we recognize.
 */
export function explainNotesError(err: unknown): string | null {
  const e = err as { code?: string; message?: string; statusCode?: number | string } | null;
  const msg = e?.message ?? '';
  if (e?.code === '23514' || /notes_cards_type_check/i.test(msg)) {
    return 'This card type isn’t enabled in your database yet — run the pending Notes migrations (0009–0014) in the Supabase SQL Editor.';
  }
  if (e?.code === '42P01' || /relation .* does not exist/i.test(msg)) {
    return 'A Notes table is missing — run the pending Notes migrations (0009–0014) in the Supabase SQL Editor.';
  }
  if (e?.code === '42703' || /column .* does not exist/i.test(msg)) {
    return 'The Notes schema is out of date — run the pending Notes migrations (0011–0014) in the Supabase SQL Editor.';
  }
  if (/bucket.*not.*found|bucket_id/i.test(msg)) {
    return 'The notes-media storage bucket is missing — run migration 0009 in the Supabase SQL Editor.';
  }
  if (/row.level security|violates.*policy|not.?authorized/i.test(msg) || e?.statusCode === 403) {
    return 'Storage/database permissions rejected this — check that migration 0009’s policies were applied in Supabase.';
  }
  return null;
}

// ── Auth helper ────────────────────────────────────────────────────────

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not signed in.');
  return data.user.id;
}

// ── Boards ─────────────────────────────────────────────────────────────

/**
 * Get (or create on first call) the root board for the current user.
 * The DB has a partial unique index ensuring only one root per user.
 */
export async function getOrCreateRootBoard(): Promise<Board> {
  const userId = await currentUserId();
  const { data: existing, error: selErr } = await supabase
    .from('notes_boards')
    .select('*')
    .eq('user_id', userId)
    .eq('is_root', true)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing as Board;
  const { data, error } = await supabase
    .from('notes_boards')
    .insert({ user_id: userId, name: 'Home', is_root: true })
    .select()
    .single();
  if (error) throw error;
  return data as Board;
}

export async function getBoard(id: string): Promise<Board | null> {
  const { data, error } = await supabase
    .from('notes_boards')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as Board | null) || null;
}

/** Return the chain of boards from root → ... → target (in that order). */
export async function getBoardAncestry(targetId: string): Promise<Board[]> {
  const chain: Board[] = [];
  let curId: string | null = targetId;
  // Walk up parent_id; cap at 32 to avoid runaway loops.
  for (let i = 0; i < 32 && curId; i++) {
    const b = await getBoard(curId);
    if (!b) break;
    chain.unshift(b);
    curId = b.parent_id;
  }
  return chain;
}

export async function renameBoard(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('notes_boards')
    .update({ name })
    .eq('id', id);
  if (error) throw error;
}

/** Update board metadata: star flag / tile color / tile icon. */
export async function updateBoardMeta(
  id: string,
  patch: Partial<{ starred: boolean; tile_color: SwatchKey; tile_icon: string }>,
): Promise<void> {
  const { error } = await supabase.from('notes_boards').update(patch).eq('id', id);
  if (error) throw error;
}

/**
 * Re-parent a board (sidebar drag). Moves the board row AND its tile card
 * onto the new parent's canvas. Cycle checking is the caller's job
 * (lib/notesBoardTree.wouldCreateCycle); the root board never moves.
 */
export async function reparentBoard(boardId: string, newParentId: string): Promise<void> {
  const { data: board, error: bErr } = await supabase
    .from('notes_boards')
    .select('is_root')
    .eq('id', boardId)
    .single();
  if (bErr) throw bErr;
  if ((board as { is_root: boolean }).is_root) throw new Error('The root board cannot be moved.');
  const { error } = await supabase
    .from('notes_boards')
    .update({ parent_id: newParentId })
    .eq('id', boardId);
  if (error) throw error;
  // The tile that opens this board lives on the old parent — bring it along.
  const { error: tErr } = await supabase
    .from('notes_cards')
    .update({ board_id: newParentId, parent_column: null, column_index: null })
    .eq('board_ref', boardId);
  if (tErr) throw tErr;
}

// ── Cards ──────────────────────────────────────────────────────────────

export async function listCards(boardId: string): Promise<Card[]> {
  const { data, error } = await supabase
    .from('notes_cards')
    .select('*')
    .eq('board_id', boardId)
    .order('z', { ascending: true });
  if (error) throw error;
  return (data as Card[]) || [];
}

export async function createCard(input: {
  board_id: string;
  type: CardType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  color?: SwatchKey;
  payload?: CardPayload;
  board_ref?: string | null;
  parent_column?: string | null;
  column_index?: number | null;
}): Promise<Card> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('notes_cards')
    .insert({
      user_id: userId,
      board_id: input.board_id,
      type: input.type,
      x: input.x,
      y: input.y,
      w: input.w ?? null,
      h: input.h ?? null,
      color: input.color ?? 'paper',
      payload: input.payload ?? {},
      board_ref: input.board_ref ?? null,
      parent_column: input.parent_column ?? null,
      column_index: input.column_index ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Card;
}

/** Create a board AND a board-tile card on the parent in one operation. */
export async function createBoardWithTile(input: {
  parent_board_id: string;
  name: string;
  x: number;
  y: number;
  tile_color?: SwatchKey;
  tile_icon?: string;
}): Promise<{ board: Board; tile: Card }> {
  const userId = await currentUserId();
  const { data: board, error: bErr } = await supabase
    .from('notes_boards')
    .insert({
      user_id: userId,
      parent_id: input.parent_board_id,
      name: input.name,
      tile_x: input.x,
      tile_y: input.y,
      tile_color: input.tile_color ?? 'sky',
      tile_icon: input.tile_icon ?? 'grid',
    })
    .select()
    .single();
  if (bErr) throw bErr;
  const tile = await createCard({
    board_id: input.parent_board_id,
    type: 'board',
    x: input.x,
    y: input.y,
    w: 130,
    h: 130,
    color: (input.tile_color ?? 'sky') as SwatchKey,
    payload: { name: input.name },
    board_ref: (board as Board).id,
  });
  return { board: board as Board, tile };
}

export async function updateCard(id: string, patch: Partial<{
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  z: number;
  color: SwatchKey;
  payload: CardPayload;
  parent_column: string | null;
  column_index: number | null;
  // Cross-board moves (drop on a board tile / breadcrumb, Sprint 14).
  board_id: string;
  // `type` is patchable specifically to support Note → Document conversion.
  // The DB CHECK constraint still enforces the allowed set.
  type: CardType;
}>): Promise<Card> {
  const { data, error } = await supabase
    .from('notes_cards')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Card;
}

/**
 * Soft-delete a card. Inserts a snapshot into notes_trash, then deletes the
 * row from notes_cards. If the card is a board-tile, the underlying board
 * (and all descendants) also go to trash atomically.
 *
 * Returns the id of the created trash entry so the undo layer can retract
 * it when a delete is undone (no ghost trash rows).
 */
export async function softDeleteCard(card: Card): Promise<string> {
  const userId = await currentUserId();
  if (card.type === 'board' && card.board_ref) {
    // Snapshot the entire board subtree so we could restore it later.
    const subtree = await snapshotBoardSubtree(card.board_ref);
    const { data: tRow, error: tErr } = await supabase
      .from('notes_trash')
      .insert({
        user_id: userId,
        kind: 'board',
        origin_board: card.board_id,
        snapshot: { tile: card, subtree },
      })
      .select('id')
      .single();
    if (tErr) throw tErr;
    // ON DELETE CASCADE on notes_boards will take everything below.
    const { error } = await supabase.from('notes_boards').delete().eq('id', card.board_ref);
    if (error) throw error;
    // The tile card itself is also gone via cascade from board_ref FK,
    // but in case the FK isn't cascading (shouldn't happen), explicit:
    await supabase.from('notes_cards').delete().eq('id', card.id);
    return (tRow as { id: string }).id;
  }
  const { data: tRow, error: tErr } = await supabase
    .from('notes_trash')
    .insert({
      user_id: userId,
      kind: 'card',
      origin_board: card.board_id,
      snapshot: card,
    })
    .select('id')
    .single();
  if (tErr) throw tErr;
  const { error } = await supabase.from('notes_cards').delete().eq('id', card.id);
  if (error) throw error;
  return (tRow as { id: string }).id;
}

/**
 * Re-insert a card row PRESERVING its original id. History-layer only:
 * used to undo a delete (paired with removeTrashEntry) and to redo a
 * create — keeping the id stable means later history commands that
 * reference the card stay valid.
 */
export async function insertCardRow(card: Card): Promise<Card> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('notes_cards')
    .insert({
      id: card.id,
      user_id: userId,
      board_id: card.board_id,
      type: card.type,
      x: card.x, y: card.y, w: card.w, h: card.h, z: card.z,
      color: card.color,
      payload: card.payload,
      board_ref: card.board_ref,
      parent_column: card.parent_column,
      column_index: card.column_index,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Card;
}

/**
 * Hard-delete a card row WITHOUT a trash snapshot. History-layer only, and
 * only for undoing the creation of a card with no user content (divergence
 * rule 1: anything with content must go through softDeleteCard instead —
 * callers check hasUserContent before choosing this path).
 */
export async function hardDeleteCardRow(id: string): Promise<void> {
  const { error } = await supabase.from('notes_cards').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Hard-delete a board row (cascades to its cards, sub-boards, and its own
 * tile via board_ref FK). History-layer only, for undoing the creation of
 * a board that is still EMPTY — callers must verify emptiness first; a
 * board with any content goes through softDeleteCard(tile) instead.
 */
export async function hardDeleteEmptyBoard(boardId: string): Promise<void> {
  const { error } = await supabase.from('notes_boards').delete().eq('id', boardId);
  if (error) throw error;
}

/** Remove a trash entry (used when an undo retracts a soft-delete). */
export async function removeTrashEntry(id: string): Promise<void> {
  const { error } = await supabase.from('notes_trash').delete().eq('id', id);
  if (error) throw error;
}

async function snapshotBoardSubtree(rootBoardId: string): Promise<{
  boards: Board[];
  cards: Card[];
  arrows: Arrow[];
}> {
  // Walk the subtree breadth-first. Arrows ride along (Sprint 18) so a
  // board restore can reconnect them.
  const boards: Board[] = [];
  const cards: Card[] = [];
  const arrows: Arrow[] = [];
  const queue = [rootBoardId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const b = await getBoard(id);
    if (!b) continue;
    boards.push(b);
    const cs = await listCards(id);
    cards.push(...cs);
    arrows.push(...(await listArrows(id).catch(() => [] as Arrow[])));
    for (const c of cs) {
      if (c.type === 'board' && c.board_ref) queue.push(c.board_ref);
    }
  }
  return { boards, cards, arrows };
}

/**
 * Soft-delete a column WITH its members as one composite, restorable-as-a-
 * unit trash entry (kind 'column'). Members are snapshotted from the
 * caller's state; the DB cascade on parent_column removes their rows when
 * the column row is deleted.
 */
export async function softDeleteColumn(column: Card, members: Card[]): Promise<string> {
  const userId = await currentUserId();
  const { data: tRow, error: tErr } = await supabase
    .from('notes_trash')
    .insert({
      user_id: userId,
      kind: 'column',
      origin_board: column.board_id,
      snapshot: { column, members },
    })
    .select('id')
    .single();
  if (tErr) throw tErr;
  const { error } = await supabase.from('notes_cards').delete().eq('id', column.id);
  if (error) throw error;
  return (tRow as { id: string }).id;
}

/**
 * Soft-delete a single to-do item (a line within a to-do card).
 * Returns the updated card and the trash entry id (for undo retraction).
 */
export async function softDeleteTodoItem(
  card: Card,
  item: TodoItem,
): Promise<{ card: Card; trashId: string }> {
  const userId = await currentUserId();
  const { data: tRow, error: tErr } = await supabase
    .from('notes_trash')
    .insert({
      user_id: userId,
      kind: 'todo_item',
      origin_card: card.id,
      snapshot: item,
    })
    .select('id')
    .single();
  if (tErr) throw tErr;
  const items = ((card.payload as any).items ?? []).filter(
    (it: TodoItem) => it.id !== item.id,
  );
  const updated = await updateCard(card.id, { payload: { ...(card.payload as any), items } });
  return { card: updated, trashId: (tRow as { id: string }).id };
}

/** Every board of the current user (client-side search index). */
export async function listAllBoards(): Promise<Board[]> {
  const { data, error } = await supabase.from('notes_boards').select('*');
  if (error) throw error;
  return (data as Board[]) || [];
}

/** Every card of the current user (client-side search index). */
export async function listAllCards(): Promise<Card[]> {
  const { data, error } = await supabase.from('notes_cards').select('*');
  if (error) throw error;
  return (data as Card[]) || [];
}

// ── Arrows ─────────────────────────────────────────────────────────────

export async function listArrows(boardId: string): Promise<Arrow[]> {
  const { data, error } = await supabase
    .from('notes_arrows')
    .select('*')
    .eq('board_id', boardId);
  if (error) throw error;
  return (data as Arrow[]) || [];
}

export async function createArrow(input: {
  board_id: string;
  from_card: string;
  to_card: string;
  label?: string;
  style?: ArrowStyle;
}): Promise<Arrow> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('notes_arrows')
    .insert({
      user_id: userId,
      board_id: input.board_id,
      from_card: input.from_card,
      to_card: input.to_card,
      label: input.label ?? '',
      style: input.style ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  return data as Arrow;
}

export async function updateArrow(id: string, patch: Partial<{
  from_card: string;
  to_card: string;
  label: string;
  style: ArrowStyle;
}>): Promise<Arrow> {
  const { data, error } = await supabase
    .from('notes_arrows')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Arrow;
}

/** Soft-delete an arrow: trash snapshot (kind 'arrow'), then delete. */
export async function softDeleteArrow(arrow: Arrow): Promise<string> {
  const userId = await currentUserId();
  const { data: tRow, error: tErr } = await supabase
    .from('notes_trash')
    .insert({
      user_id: userId,
      kind: 'arrow',
      origin_board: arrow.board_id,
      snapshot: arrow,
    })
    .select('id')
    .single();
  if (tErr) throw tErr;
  const { error } = await supabase.from('notes_arrows').delete().eq('id', arrow.id);
  if (error) throw error;
  return (tRow as { id: string }).id;
}

/** Re-insert an arrow row preserving its id (history-layer only). */
export async function insertArrowRow(arrow: Arrow): Promise<Arrow> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('notes_arrows')
    .insert({
      id: arrow.id,
      user_id: userId,
      board_id: arrow.board_id,
      from_card: arrow.from_card,
      to_card: arrow.to_card,
      label: arrow.label,
      style: arrow.style,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Arrow;
}

/** Hard-delete an arrow row (undo of arrow-create only). */
export async function hardDeleteArrowRow(id: string): Promise<void> {
  const { error } = await supabase.from('notes_arrows').delete().eq('id', id);
  if (error) throw error;
}

// ── Trash ──────────────────────────────────────────────────────────────

export async function listTrash(): Promise<TrashEntry[]> {
  const { data, error } = await supabase
    .from('notes_trash')
    .select('*')
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  return (data as TrashEntry[]) || [];
}

export type RestoreOptions = {
  /** "Restore here": target this board instead of the origin. */
  hereBoardId?: string;
  /** Canvas position override (used with hereBoardId). */
  at?: { x: number; y: number };
};

export type RestoreResult = {
  /** Top-level restored cards (tile for boards, column card for columns). */
  cards: Card[];
};

export async function restoreTrash(
  entry: TrashEntry,
  opts?: RestoreOptions,
): Promise<RestoreResult> {
  const userId = await currentUserId();
  const restored: Card[] = [];
  if (entry.kind === 'card') {
    const c = entry.snapshot as Card;
    // Target: "here" override → origin board → root fallback.
    let boardId = opts?.hereBoardId ?? c.board_id;
    const board = await getBoard(boardId);
    if (!board) {
      const root = await getOrCreateRootBoard();
      boardId = root.id;
    }
    // Column membership only survives when the parent column still exists
    // and we're restoring in place.
    let parentColumn = opts?.hereBoardId ? null : c.parent_column;
    if (parentColumn && !(await fetchCard(parentColumn))) parentColumn = null;
    const { data, error } = await supabase
      .from('notes_cards')
      .insert({
        // Don't carry the old id — let the DB mint a new one to avoid clashes.
        user_id: userId,
        board_id: boardId,
        type: c.type,
        x: opts?.at?.x ?? c.x,
        y: opts?.at?.y ?? c.y,
        w: c.w, h: c.h, z: c.z,
        color: c.color,
        payload: c.payload,
        board_ref: c.board_ref,
        parent_column: parentColumn,
        column_index: parentColumn ? c.column_index : null,
      })
      .select()
      .single();
    if (error) throw error;
    restored.push(data as Card);
  } else if (entry.kind === 'todo_item') {
    const item = entry.snapshot as TodoItem;
    const card = entry.origin_card ? await fetchCard(entry.origin_card) : null;
    if (card) {
      const items = [...(((card.payload as any).items as TodoItem[]) ?? []), item];
      await updateCard(card.id, { payload: { ...(card.payload as any), items } });
    }
  } else if (entry.kind === 'arrow') {
    // Restore only if BOTH endpoint cards still exist.
    const a = entry.snapshot as Arrow;
    const [fromCard, toCard] = await Promise.all([fetchCard(a.from_card), fetchCard(a.to_card)]);
    if (fromCard && toCard) {
      const { error } = await supabase.from('notes_arrows').insert({
        user_id: userId,
        board_id: a.board_id,
        from_card: a.from_card,
        to_card: a.to_card,
        label: a.label,
        style: a.style,
      });
      if (error) throw error;
    }
  } else if (entry.kind === 'column') {
    // Restore column + members as a unit with FRESH ids (originals may
    // clash), remapping members' parent_column onto the new column id.
    const snap = entry.snapshot as { column: Card; members: Card[] };
    let boardId = opts?.hereBoardId ?? snap.column.board_id;
    const board = await getBoard(boardId);
    if (!board) {
      const root = await getOrCreateRootBoard();
      boardId = root.id;
    }
    const { data: newCol, error: cErr } = await supabase
      .from('notes_cards')
      .insert({
        user_id: userId,
        board_id: boardId,
        type: 'column',
        x: opts?.at?.x ?? snap.column.x,
        y: opts?.at?.y ?? snap.column.y,
        w: snap.column.w, h: snap.column.h, z: snap.column.z,
        color: snap.column.color,
        payload: snap.column.payload,
      })
      .select()
      .single();
    if (cErr) throw cErr;
    restored.push(newCol as Card);
    const sorted = [...snap.members].sort(
      (a, b) => (a.column_index ?? 0) - (b.column_index ?? 0),
    );
    for (let i = 0; i < sorted.length; i++) {
      const m = sorted[i];
      const { error } = await supabase.from('notes_cards').insert({
        user_id: userId,
        board_id: boardId,
        type: m.type,
        x: m.x, y: m.y, w: m.w, h: m.h, z: m.z,
        color: m.color,
        payload: m.payload,
        board_ref: m.board_ref,
        parent_column: (newCol as Card).id,
        column_index: i,
      });
      if (error) throw error;
    }
  }
  else if (entry.kind === 'board') {
    // Trash v2 (Sprint 18): rebuild the entire subtree from the snapshot
    // with fresh ids via the pure remapper — boards, cards (columns
    // before members, FK order), nested tiles, and internal arrows.
    const snap = entry.snapshot as BoardSnapshot;
    let parentId = opts?.hereBoardId ?? snap.tile.board_id;
    const parent = await getBoard(parentId);
    if (!parent) {
      const root = await getOrCreateRootBoard();
      parentId = root.id;
    }
    const plan = remapBoardSnapshot(snap, parentId, () => crypto.randomUUID());
    for (const b of plan.boards) {
      const { error } = await supabase.from('notes_boards').insert({ ...b, user_id: userId });
      if (error) throw error;
    }
    const freeFirst = [...plan.cards].sort(
      (a, b) => Number(Boolean(a.parent_column)) - Number(Boolean(b.parent_column)),
    );
    for (const c of freeFirst) {
      const { error } = await supabase.from('notes_cards').insert({ ...c, user_id: userId });
      if (error) throw error;
    }
    const { data: tileRow, error: tErr } = await supabase
      .from('notes_cards')
      .insert({
        ...plan.tile,
        x: opts?.at?.x ?? plan.tile.x,
        y: opts?.at?.y ?? plan.tile.y,
        user_id: userId,
      })
      .select()
      .single();
    if (tErr) throw tErr;
    for (const a of plan.arrows) {
      const { error } = await supabase.from('notes_arrows').insert({ ...a, user_id: userId });
      if (error) throw error;
    }
    restored.push(tileRow as Card);
  }

  await supabase.from('notes_trash').delete().eq('id', entry.id);
  return { cards: restored };
}

/** Fetch a single trash entry (history redo of a restore). */
export async function fetchTrashEntry(id: string): Promise<TrashEntry | null> {
  const { data, error } = await supabase
    .from('notes_trash')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as TrashEntry | null) || null;
}

/**
 * PERMANENT delete of a trash entry — the only place trash rows die
 * without a restore (never automatic; always user-confirmed upstream).
 * Media objects referenced by the snapshot are removed from Storage only
 * when no live card AND no other trash entry still references the same
 * path (duplicates share storage).
 */
export async function permanentlyDeleteTrashEntry(entry: TrashEntry): Promise<void> {
  const paths = collectMediaPaths(entry.kind, entry.snapshot);
  if (paths.length > 0) {
    const others = (await listTrash()).filter((t) => t.id !== entry.id);
    const otherPaths = new Set(others.flatMap((t) => collectMediaPaths(t.kind, t.snapshot)));
    const deletable: string[] = [];
    for (const p of paths) {
      if (otherPaths.has(p)) continue;
      const { data, error } = await supabase
        .from('notes_cards')
        .select('id')
        .or(`payload->>storagePath.eq.${p},payload->>thumbPath.eq.${p}`)
        .limit(1);
      if (error) throw error;
      if ((data ?? []).length === 0) deletable.push(p);
    }
    if (deletable.length > 0) {
      await removeStorageObjects(deletable).catch((err) =>
        console.error('storage cleanup failed:', err),
      );
    }
  }
  const { error } = await supabase.from('notes_trash').delete().eq('id', entry.id);
  if (error) throw error;
}

async function fetchCard(id: string): Promise<Card | null> {
  const { data, error } = await supabase
    .from('notes_cards')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as Card | null) || null;
}
