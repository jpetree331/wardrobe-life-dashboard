// Typed CRUD for the Notes room. Three tables (notes_boards, notes_cards,
// notes_trash) — see supabase/migrations/0004_notes.sql for the schema.
//
// Boards form a tree. Each user has exactly one root board (is_root=true);
// nested boards have parent_id set. Cards live on a board; the special
// 'board' card type is a tile that points at another board via board_ref.

import { supabase } from './supabase';

export type SwatchKey =
  | 'paper' | 'saffron' | 'rose' | 'sage' | 'sky' | 'violet' | 'clay';

export const SWATCHES: SwatchKey[] = [
  'paper', 'saffron', 'rose', 'sage', 'sky', 'violet', 'clay',
];

export type CardType = 'note' | 'todo' | 'heading' | 'link' | 'document' | 'board' | 'image';

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

export type CardPayload =
  | { body: string }                                                   // note, heading
  | { title: string; items: TodoItem[] }                               // todo
  | { title: string; url: string }                                     // link
  | { title: string; body: string; mode: 'icon' | 'preview' }          // document
  | { name: string }                                                   // board tile mirror
  | ImagePayload                                                        // image
  | Record<string, unknown>;                                            // catch-all

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
  created_at: string;
  updated_at: string;
};

export type TrashEntry = {
  id: string;
  user_id: string;
  kind: 'card' | 'todo_item' | 'board';
  origin_board: string | null;
  origin_card: string | null;
  snapshot: any;
  deleted_at: string;
};

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
}> {
  // Walk the subtree breadth-first.
  const boards: Board[] = [];
  const cards: Card[] = [];
  const queue = [rootBoardId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const b = await getBoard(id);
    if (!b) continue;
    boards.push(b);
    const cs = await listCards(id);
    cards.push(...cs);
    for (const c of cs) {
      if (c.type === 'board' && c.board_ref) queue.push(c.board_ref);
    }
  }
  return { boards, cards };
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

// ── Trash ──────────────────────────────────────────────────────────────

export async function listTrash(): Promise<TrashEntry[]> {
  const { data, error } = await supabase
    .from('notes_trash')
    .select('*')
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  return (data as TrashEntry[]) || [];
}

export async function restoreTrash(entry: TrashEntry): Promise<void> {
  const userId = await currentUserId();
  if (entry.kind === 'card') {
    const c = entry.snapshot as Card;
    // Re-insert the card; if its origin board was deleted, fall back to root.
    let boardId = c.board_id;
    const board = await getBoard(boardId);
    if (!board) {
      const root = await getOrCreateRootBoard();
      boardId = root.id;
    }
    const { error } = await supabase.from('notes_cards').insert({
      // Don't carry the old id — let the DB mint a new one to avoid clashes.
      user_id: userId,
      board_id: boardId,
      type: c.type,
      x: c.x, y: c.y, w: c.w, h: c.h, z: c.z,
      color: c.color,
      payload: c.payload,
      board_ref: c.board_ref,
    });
    if (error) throw error;
  } else if (entry.kind === 'todo_item') {
    const item = entry.snapshot as TodoItem;
    const card = entry.origin_card ? await fetchCard(entry.origin_card) : null;
    if (card) {
      const items = [...(((card.payload as any).items as TodoItem[]) ?? []), item];
      await updateCard(card.id, { payload: { ...(card.payload as any), items } });
    }
  }
  // 'board' kind restore: out of scope for v1 — boards going to trash is
  // rarely undone in practice, and re-creating the whole subtree from
  // snapshot needs careful id remapping. We still SAVE the snapshot so a
  // later restore command can be added.

  await supabase.from('notes_trash').delete().eq('id', entry.id);
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
