// Pure board-tree logic for the sidebar: nesting flat rows into a tree
// and the re-parent cycle check. Unit-tested.

export type TreeBoard = {
  id: string;
  name: string;
  parent_id: string | null;
  is_root: boolean;
};

export type BoardNode<T extends TreeBoard = TreeBoard> = {
  board: T;
  children: BoardNode<T>[];
};

/**
 * Nest flat board rows into a tree rooted at the is_root board. Children
 * sort by name. Orphans (dangling parent_id) attach under the root so
 * nothing silently disappears from the sidebar.
 */
export function buildBoardTree<T extends TreeBoard>(boards: T[]): BoardNode<T> | null {
  const root = boards.find((b) => b.is_root);
  if (!root) return null;
  const byParent = new Map<string, T[]>();
  const ids = new Set(boards.map((b) => b.id));
  for (const b of boards) {
    if (b.id === root.id) continue;
    const parent = b.parent_id && ids.has(b.parent_id) ? b.parent_id : root.id;
    const list = byParent.get(parent) ?? [];
    list.push(b);
    byParent.set(parent, list);
  }
  const build = (board: T): BoardNode<T> => ({
    board,
    children: (byParent.get(board.id) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(build),
  });
  return build(root);
}

/**
 * Would re-parenting `moveId` under `targetId` create a cycle? True when
 * the target IS the moved board or lives anywhere in its subtree (i.e.
 * the moved board appears among the target's ancestors).
 */
export function wouldCreateCycle(
  boards: TreeBoard[],
  moveId: string,
  targetId: string,
): boolean {
  if (moveId === targetId) return true;
  const byId = new Map(boards.map((b) => [b.id, b]));
  let cur = byId.get(targetId);
  for (let i = 0; i < 64 && cur; i++) {
    if (cur.id === moveId) return true;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return false;
}
