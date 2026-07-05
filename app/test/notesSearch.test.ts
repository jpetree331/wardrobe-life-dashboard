import { describe, it, expect } from 'vitest';
import {
  boardPath,
  cardText,
  makeSnippet,
  searchBoards,
  searchCards,
  type BoardLite,
} from '../src/lib/notesSearch';
import type { Card } from '../src/lib/notes';

const boards: BoardLite[] = [
  { id: 'root', name: 'Home', parent_id: null, is_root: true },
  { id: 'p', name: 'Projects', parent_id: 'root', is_root: false },
  { id: 'r', name: 'Recipes', parent_id: 'p', is_root: false },
  { id: 'x', name: 'Prose', parent_id: 'root', is_root: false },
];

function card(id: string, type: Card['type'], payload: unknown, boardId = 'r'): Card {
  return {
    id, user_id: 'u', board_id: boardId, type, x: 0, y: 0, w: null, h: null,
    z: 0, color: 'paper', payload, board_ref: null, parent_column: null,
    column_index: null, created_at: '', updated_at: '',
  } as Card;
}

describe('boardPath', () => {
  it('walks root → target', () => {
    const byId = new Map(boards.map((b) => [b.id, b]));
    expect(boardPath('r', byId)).toEqual(['Home', 'Projects', 'Recipes']);
    expect(boardPath('root', byId)).toEqual(['Home']);
  });
});

describe('cardText', () => {
  it('extracts per type, stripping HTML', () => {
    expect(cardText('note', { body: '<p>Hello <b>world</b></p>' })).toBe('Hello world');
    expect(cardText('todo', { title: 'List', items: [{ text: 'milk' }] })).toBe('List milk');
    expect(cardText('link', { title: 'Site', url: 'https://x.dev' })).toContain('x.dev');
    expect(cardText('file', { filename: 'plan.pdf' })).toBe('plan.pdf');
    expect(cardText('swatch', { label: 'Gold', hex: '#aa8833' })).toBe('Gold #aa8833');
  });
});

describe('makeSnippet', () => {
  it('returns context around the first case-insensitive match', () => {
    const s = makeSnippet('The shepherd knows his sheep by name', 'SHEEP', 8);
    expect(s?.match).toBe('sheep');
    expect(s?.before.endsWith('his ')).toBe(true);
  });
  it('marks truncation with ellipses', () => {
    const long = 'a'.repeat(100) + 'needle' + 'b'.repeat(100);
    const s = makeSnippet(long, 'needle', 10)!;
    expect(s.before.startsWith('…')).toBe(true);
    expect(s.after.endsWith('…')).toBe(true);
  });
  it('returns null when absent', () => {
    expect(makeSnippet('abc', 'zzz')).toBeNull();
    expect(makeSnippet('abc', '  ')).toBeNull();
  });
});

describe('searchBoards', () => {
  it('ranks prefix matches first and includes paths', () => {
    const hits = searchBoards('pro', boards);
    expect(hits.map((h) => h.board.name)).toEqual(['Projects', 'Prose']);
    expect(hits[0].path).toEqual(['Home', 'Projects']);
  });
  it('empty query yields nothing (recents handled by the overlay)', () => {
    expect(searchBoards('', boards)).toEqual([]);
  });
});

describe('searchCards', () => {
  it('finds content across types with paths, shortest text first', () => {
    const cards = [
      card('a', 'note', { body: '<p>' + 'padding '.repeat(30) + 'lantern here</p>' }),
      card('b', 'heading', { body: 'Lantern' }, 'p'),
      card('c', 'note', { body: '<p>nothing relevant</p>' }),
    ];
    const hits = searchCards('lantern', cards, boards);
    expect(hits.map((h) => h.card.id)).toEqual(['b', 'a']);
    expect(hits[0].path).toEqual(['Home', 'Projects']);
    expect(hits[0].snippet.match.toLowerCase()).toBe('lantern');
  });
  it('respects the limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => card(`c${i}`, 'note', { body: '<p>same match text</p>' }));
    expect(searchCards('match', many, boards, 30)).toHaveLength(30);
  });
});
