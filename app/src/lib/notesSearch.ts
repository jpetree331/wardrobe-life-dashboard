// Pure search logic for the global search / quick switcher: extracting
// searchable text per card type, board path building, ranking, and
// snippet generation. The overlay fetches a fresh client-side index each
// time it opens (single-user scale), then runs these. Unit-tested.

import type { Card, CardType } from './notes';

export type BoardLite = {
  id: string;
  name: string;
  parent_id: string | null;
  is_root: boolean;
};

/** Names from the root down to the board, e.g. ['Home','Projects','X']. */
export function boardPath(boardId: string, byId: Map<string, BoardLite>): string[] {
  const names: string[] = [];
  let cur = byId.get(boardId);
  for (let i = 0; i < 32 && cur; i++) {
    names.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return names;
}

/** Searchable plain text of a card payload. */
export function cardText(type: CardType, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, any>;
  const strip = (html: unknown) =>
    typeof html === 'string' ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  switch (type) {
    case 'note':
    case 'heading':  return strip(p.body);
    case 'todo':     return [p.title, ...((p.items ?? []) as Array<{ text: string }>).map((it) => it.text)].filter(Boolean).join(' ');
    case 'link':     return [p.title, p.url, p.description, p.siteName].filter(Boolean).join(' ');
    case 'document': return [p.title, strip(p.body)].filter(Boolean).join(' ');
    case 'image':    return p.caption ?? '';
    case 'file':     return p.filename ?? '';
    case 'column':   return p.title ?? '';
    case 'swatch':   return [p.label, p.hex].filter(Boolean).join(' ');
    case 'comment':  return p.body ?? '';
    case 'board':    return p.name ?? '';
    default:         return '';
  }
}

export type Snippet = { before: string; match: string; after: string };

/** Context snippet around the first case-insensitive match; null if none. */
export function makeSnippet(text: string, query: string, radius = 44): Snippet | null {
  const q = query.trim();
  if (!q) return null;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, idx),
    match: text.slice(idx, idx + q.length),
    after: text.slice(idx + q.length, end) + (end < text.length ? '…' : ''),
  };
}

export type BoardHit = { board: BoardLite; path: string[] };
export type CardHit = { card: Card; snippet: Snippet; path: string[] };

/** Boards whose NAME matches, prefix matches ranked first. */
export function searchBoards(query: string, boards: BoardLite[], limit = 8): BoardHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const byId = new Map(boards.map((b) => [b.id, b]));
  const hits = boards
    .filter((b) => b.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return ap - bp || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
  return hits.map((board) => ({ board, path: boardPath(board.id, byId) }));
}

/** Cards whose content matches; shorter matched texts rank higher. */
export function searchCards(
  query: string,
  cards: Card[],
  boards: BoardLite[],
  limit = 30,
): CardHit[] {
  const q = query.trim();
  if (!q) return [];
  const byId = new Map(boards.map((b) => [b.id, b]));
  const hits: Array<CardHit & { rank: number }> = [];
  for (const card of cards) {
    const text = cardText(card.type, card.payload);
    const snippet = makeSnippet(text, q);
    if (!snippet) continue;
    hits.push({
      card,
      snippet,
      path: boardPath(card.board_id, byId),
      rank: text.length,
    });
  }
  hits.sort((a, b) => a.rank - b.rank);
  return hits.slice(0, limit).map(({ rank: _r, ...hit }) => hit);
}
