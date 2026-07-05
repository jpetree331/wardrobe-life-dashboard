import { describe, it, expect } from 'vitest';
import {
  collectMediaPaths,
  remapBoardSnapshot,
  type BoardSnapshot,
} from '../src/lib/notesTrashRestore';
import type { Arrow, Board, Card } from '../src/lib/notes';

function seqIdGen(): () => string {
  let n = 0;
  return () => `new-${++n}`;
}

const board = (id: string, parent: string | null): Board =>
  ({ id, user_id: 'u', parent_id: parent, name: `B-${id}`, tile_x: 0, tile_y: 0,
     tile_color: 'sky', tile_icon: 'grid', is_root: false, starred: false,
     created_at: '', updated_at: '' } as Board);

const card = (id: string, boardId: string, over: Partial<Card> = {}): Card =>
  ({ id, user_id: 'u', board_id: boardId, type: 'note', x: 1, y: 2, w: 100, h: 50,
     z: 0, color: 'paper', payload: { body: `<p>${id}</p>` }, board_ref: null,
     parent_column: null, column_index: null, created_at: '', updated_at: '', ...over } as Card);

const arrow = (id: string, boardId: string, from: string, to: string): Arrow =>
  ({ id, user_id: 'u', board_id: boardId, from_card: from, to_card: to,
     label: 'L', style: { dashed: true }, created_at: '', updated_at: '' } as Arrow);

// Structure: root board 'b1' (tile 'tile1' points at it) containing a note,
// a column with a member, a nested board tile → board 'b2' with one card,
// plus arrows (one internal, one dangling out of the subtree).
const snapshot: BoardSnapshot = {
  tile: card('tile1', 'parent-old', { type: 'board', board_ref: 'b1', payload: { name: 'Sub' } }),
  subtree: {
    boards: [board('b1', 'parent-old'), board('b2', 'b1')],
    cards: [
      card('n1', 'b1'),
      card('col1', 'b1', { type: 'column', payload: { title: 'Col' } }),
      card('m1', 'b1', { parent_column: 'col1', column_index: 0 }),
      card('tile2', 'b1', { type: 'board', board_ref: 'b2', payload: { name: 'Deeper' } }),
      card('n2', 'b2', { payload: { storagePath: 'u/img-orig.png', naturalW: 10, naturalH: 10 } as any, type: 'image' }),
    ],
    arrows: [
      arrow('a1', 'b1', 'n1', 'col1'),
      arrow('a2', 'b1', 'n1', 'outside-card'),
    ],
  },
};

describe('remapBoardSnapshot', () => {
  const out = remapBoardSnapshot(snapshot, 'new-parent', seqIdGen());

  it('mints fresh ids for every row (no collisions with the originals)', () => {
    const oldIds = new Set(['b1', 'b2', 'n1', 'col1', 'm1', 'tile2', 'n2', 'tile1', 'a1', 'a2']);
    const newIds = [
      ...out.boards.map((b) => b.id),
      ...out.cards.map((c) => c.id),
      ...out.arrows.map((a) => a.id),
      out.tile.id,
    ];
    expect(newIds.every((id) => !oldIds.has(id))).toBe(true);
    expect(new Set(newIds).size).toBe(newIds.length);
  });

  it('re-parents the subtree root under the restore target', () => {
    const rootRow = out.boards.find((b) => b.id === out.rootBoardId)!;
    expect(rootRow.parent_id).toBe('new-parent');
    const inner = out.boards.find((b) => b.name === 'B-b2')!;
    expect(inner.parent_id).toBe(out.rootBoardId);
  });

  it('remaps card board_ids, nested board_refs, and column membership', () => {
    const byOldName = (frag: string) =>
      out.cards.find((c) => JSON.stringify(c.payload).includes(frag))!;
    const n1 = byOldName('n1');
    expect(n1.board_id).toBe(out.rootBoardId);
    const member = byOldName('m1');
    const column = out.cards.find((c) => c.type === 'column')!;
    expect(member.parent_column).toBe(column.id);
    expect(member.column_index).toBe(0);
    const tile2 = out.cards.find((c) => c.type === 'board')!;
    const b2 = out.boards.find((b) => b.name === 'B-b2')!;
    expect(tile2.board_ref).toBe(b2.id);
    const n2 = out.cards.find((c) => c.type === 'image')!;
    expect(n2.board_id).toBe(b2.id);
  });

  it('keeps arrows with both endpoints inside; drops dangling ones', () => {
    expect(out.arrows).toHaveLength(1);
    const a = out.arrows[0];
    const n1 = out.cards.find((c) => JSON.stringify(c.payload).includes('n1'))!;
    const col = out.cards.find((c) => c.type === 'column')!;
    expect(a.from_card).toBe(n1.id);
    expect(a.to_card).toBe(col.id);
    expect(a.board_id).toBe(out.rootBoardId);
  });

  it('points the new tile at the new root on the new parent board', () => {
    expect(out.tile.board_id).toBe('new-parent');
    expect(out.tile.board_ref).toBe(out.rootBoardId);
    expect((out.tile.payload as { name: string }).name).toBe('Sub');
  });

  it('tolerates pre-Sprint-18 snapshots without arrows', () => {
    const legacy = { ...snapshot, subtree: { ...snapshot.subtree, arrows: undefined } };
    expect(remapBoardSnapshot(legacy, 'p', seqIdGen()).arrows).toEqual([]);
  });
});

describe('collectMediaPaths', () => {
  it('finds storage paths in card, column, and board snapshots', () => {
    expect(collectMediaPaths('card', { payload: { storagePath: 'a', thumbPath: 'b' } })).toEqual(['a', 'b']);
    expect(collectMediaPaths('column', { members: [{ payload: { storagePath: 'x' } }] })).toEqual(['x']);
    expect(collectMediaPaths('board', snapshot)).toEqual(['u/img-orig.png']);
    expect(collectMediaPaths('todo_item', { text: 'x' })).toEqual([]);
  });
});
