import { describe, it, expect } from 'vitest';
import { buildBoardTree, wouldCreateCycle, type TreeBoard } from '../src/lib/notesBoardTree';

const b = (id: string, name: string, parent: string | null, root = false): TreeBoard => ({
  id, name, parent_id: parent, is_root: root,
});

const boards = [
  b('root', 'Home', null, true),
  b('a', 'Alpha', 'root'),
  b('b', 'Beta', 'root'),
  b('a1', 'Nested', 'a'),
  b('a2', 'Another', 'a'),
];

describe('buildBoardTree', () => {
  it('nests children under parents, sorted by name', () => {
    const tree = buildBoardTree(boards)!;
    expect(tree.board.id).toBe('root');
    expect(tree.children.map((n) => n.board.id)).toEqual(['a', 'b']);
    expect(tree.children[0].children.map((n) => n.board.name)).toEqual(['Another', 'Nested']);
  });
  it('attaches orphans under the root', () => {
    const tree = buildBoardTree([...boards, b('lost', 'Lost', 'ghost-parent')])!;
    expect(tree.children.map((n) => n.board.name)).toContain('Lost');
  });
  it('returns null without a root', () => {
    expect(buildBoardTree([b('x', 'X', null)])).toBeNull();
  });
});

describe('wouldCreateCycle', () => {
  it('rejects moving a board into itself', () => {
    expect(wouldCreateCycle(boards, 'a', 'a')).toBe(true);
  });
  it('rejects moving an ancestor into its descendant', () => {
    expect(wouldCreateCycle(boards, 'a', 'a1')).toBe(true);
    expect(wouldCreateCycle(boards, 'root', 'a2')).toBe(true);
  });
  it('allows legitimate moves', () => {
    expect(wouldCreateCycle(boards, 'a1', 'b')).toBe(false);
    expect(wouldCreateCycle(boards, 'b', 'a1')).toBe(false);
  });
});
