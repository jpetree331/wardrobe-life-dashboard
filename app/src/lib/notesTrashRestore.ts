// Pure id-remapping for board-subtree restore (Trash v2, Sprint 18).
//
// A board trash snapshot holds the tile card plus the full subtree
// (boards, cards, and — since Sprint 18 — arrows). Restoring must mint
// FRESH ids for every row while preserving the internal structure:
//   board.parent_id chains, card.board_id, nested tiles' board_ref,
//   column membership (parent_column), and arrows whose endpoints both
//   survived. This module is pure so those rules are unit-testable; the
//   Supabase inserts live in notes.ts.

import type { Arrow, Board, Card } from './notes';

export type BoardSnapshot = {
  tile: Card;
  subtree: {
    boards: Board[];
    cards: Card[];
    arrows?: Arrow[]; // absent in pre-Sprint-18 snapshots
  };
};

export type RemappedBoardRow = {
  id: string;
  parent_id: string;
  name: string;
  tile_x: number;
  tile_y: number;
  tile_color: string;
  tile_icon: string;
  starred: boolean;
};

export type RemappedCardRow = {
  id: string;
  board_id: string;
  type: Card['type'];
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  z: number;
  color: string;
  payload: unknown;
  board_ref: string | null;
  parent_column: string | null;
  column_index: number | null;
};

export type RemappedArrowRow = {
  id: string;
  board_id: string;
  from_card: string;
  to_card: string;
  label: string;
  style: unknown;
};

export type RemappedSnapshot = {
  /** The subtree's root board id AFTER remapping (the tile points here). */
  rootBoardId: string;
  boards: RemappedBoardRow[];
  cards: RemappedCardRow[];
  arrows: RemappedArrowRow[];
  tile: RemappedCardRow;
};

/**
 * Remap a board snapshot onto fresh ids under `newParentBoardId`.
 * `idGen` is injected for testability (production passes randomUUID).
 */
export function remapBoardSnapshot(
  snapshot: BoardSnapshot,
  newParentBoardId: string,
  idGen: () => string,
): RemappedSnapshot {
  const { tile, subtree } = snapshot;
  const boards = subtree?.boards ?? [];
  const cards = subtree?.cards ?? [];
  const arrows = subtree?.arrows ?? [];

  const boardIdMap = new Map<string, string>();
  for (const b of boards) boardIdMap.set(b.id, idGen());
  const cardIdMap = new Map<string, string>();
  for (const c of cards) cardIdMap.set(c.id, idGen());

  const oldRootId = tile.board_ref ?? boards[0]?.id ?? '';
  const rootBoardId = boardIdMap.get(oldRootId) ?? idGen();
  if (!boardIdMap.has(oldRootId) && oldRootId) boardIdMap.set(oldRootId, rootBoardId);

  const newBoards: RemappedBoardRow[] = boards.map((b) => ({
    id: boardIdMap.get(b.id)!,
    // The subtree root re-parents under the restore target; interior
    // parents remap; orphans fall back to the restored root.
    parent_id:
      b.id === oldRootId
        ? newParentBoardId
        : (b.parent_id && boardIdMap.get(b.parent_id)) || rootBoardId,
    name: b.name,
    tile_x: b.tile_x,
    tile_y: b.tile_y,
    tile_color: b.tile_color,
    tile_icon: b.tile_icon,
    starred: Boolean(b.starred),
  }));

  const newCards: RemappedCardRow[] = cards.map((c) => ({
    id: cardIdMap.get(c.id)!,
    board_id: boardIdMap.get(c.board_id) ?? rootBoardId,
    type: c.type,
    x: c.x, y: c.y, w: c.w, h: c.h, z: c.z,
    color: c.color,
    payload: c.payload,
    board_ref: c.board_ref ? boardIdMap.get(c.board_ref) ?? null : null,
    parent_column: c.parent_column ? cardIdMap.get(c.parent_column) ?? null : null,
    column_index: c.column_index,
  }));

  // Arrows survive only when BOTH endpoints are inside the subtree.
  const newArrows: RemappedArrowRow[] = arrows
    .filter((a) => cardIdMap.has(a.from_card) && cardIdMap.has(a.to_card))
    .map((a) => ({
      id: idGen(),
      board_id: boardIdMap.get(a.board_id) ?? rootBoardId,
      from_card: cardIdMap.get(a.from_card)!,
      to_card: cardIdMap.get(a.to_card)!,
      label: a.label,
      style: a.style,
    }));

  const newTile: RemappedCardRow = {
    id: idGen(),
    board_id: newParentBoardId,
    type: 'board',
    x: tile.x, y: tile.y, w: tile.w, h: tile.h, z: tile.z,
    color: tile.color,
    payload: tile.payload,
    board_ref: rootBoardId,
    parent_column: null,
    column_index: null,
  };

  return { rootBoardId, boards: newBoards, cards: newCards, arrows: newArrows, tile: newTile };
}

/**
 * Media storage paths referenced inside a trash snapshot — used by
 * permanent delete to decide which objects may be removed.
 */
export function collectMediaPaths(kind: string, snapshot: unknown): string[] {
  const paths: string[] = [];
  const fromPayload = (p: unknown) => {
    const rec = (p ?? {}) as Record<string, unknown>;
    if (typeof rec.storagePath === 'string') paths.push(rec.storagePath);
    if (typeof rec.thumbPath === 'string') paths.push(rec.thumbPath);
  };
  if (kind === 'card') {
    fromPayload((snapshot as Card)?.payload);
  } else if (kind === 'column') {
    const snap = snapshot as { column?: Card; members?: Card[] };
    for (const m of snap?.members ?? []) fromPayload(m.payload);
  } else if (kind === 'board') {
    const snap = snapshot as BoardSnapshot;
    for (const c of snap?.subtree?.cards ?? []) fromPayload(c.payload);
  }
  return paths;
}
