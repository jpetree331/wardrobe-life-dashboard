import { describe, it, expect } from 'vitest';
import {
  BoardHistory,
  BurstCoalescer,
  hasUserContent,
  MAX_HISTORY,
  type Command,
} from '../src/lib/notesHistory';
import type { Card } from '../src/lib/notes';

function cmd(label: string, log: string[]): Command {
  return {
    label,
    do: () => { log.push(`do:${label}`); },
    undo: () => { log.push(`undo:${label}`); },
  };
}

describe('BoardHistory', () => {
  it('push-after-apply: push never executes the command', () => {
    const log: string[] = [];
    const h = new BoardHistory();
    h.push(cmd('a', log));
    expect(log).toEqual([]);
    expect(h.canUndo()).toBe(true);
    expect(h.canRedo()).toBe(false);
    expect(h.peekUndoLabel()).toBe('a');
  });

  it('undo runs undo(), redo runs do(), in LIFO order', async () => {
    const log: string[] = [];
    const h = new BoardHistory();
    h.push(cmd('a', log));
    h.push(cmd('b', log));
    await h.undo();
    await h.undo();
    expect(log).toEqual(['undo:b', 'undo:a']);
    expect(h.canUndo()).toBe(false);
    expect(h.peekRedoLabel()).toBe('a');
    await h.redo();
    await h.redo();
    expect(log).toEqual(['undo:b', 'undo:a', 'do:a', 'do:b']);
    expect(h.canRedo()).toBe(false);
    expect(h.canUndo()).toBe(true);
  });

  it('a new push clears the redo stack', async () => {
    const log: string[] = [];
    const h = new BoardHistory();
    h.push(cmd('a', log));
    await h.undo();
    expect(h.canRedo()).toBe(true);
    h.push(cmd('b', log));
    expect(h.canRedo()).toBe(false);
    expect(h.peekUndoLabel()).toBe('b');
  });

  it('caps the stack, dropping the oldest entries', () => {
    const log: string[] = [];
    const h = new BoardHistory(3);
    for (const l of ['a', 'b', 'c', 'd']) h.push(cmd(l, log));
    expect(h.depth).toBe(3);
    expect(h.peekUndoLabel()).toBe('d');
  });

  it(`default cap is ${MAX_HISTORY} and does not grow unbounded`, () => {
    const log: string[] = [];
    const h = new BoardHistory();
    for (let i = 0; i < MAX_HISTORY + 50; i++) h.push(cmd(String(i), log));
    expect(h.depth).toBe(MAX_HISTORY);
  });

  it('a failing undo drops the command instead of pushing it to redo', async () => {
    const h = new BoardHistory();
    h.push({
      label: 'bad',
      do: () => {},
      undo: () => { throw new Error('boom'); },
    });
    const result = await h.undo();
    expect(result).toBeNull();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it('notifies onChange on push, undo, and redo', async () => {
    let ticks = 0;
    const h = new BoardHistory();
    h.onChange = () => { ticks++; };
    h.push(cmd('a', []));
    expect(ticks).toBe(1);
    await h.undo(); // busy-on, busy-off
    expect(ticks).toBeGreaterThanOrEqual(2);
  });

  it('undo returns null when there is nothing to undo', async () => {
    const h = new BoardHistory();
    expect(await h.undo()).toBeNull();
    expect(await h.redo()).toBeNull();
  });
});

describe('BurstCoalescer', () => {
  it('keeps the FIRST before-snapshot across a burst', () => {
    const c = new BurstCoalescer<number>();
    c.begin('card1', 10);
    c.begin('card1', 20); // mid-burst edits don't move the baseline
    expect(c.flush('card1')).toBe(10);
  });

  it('flush closes the burst', () => {
    const c = new BurstCoalescer<number>();
    c.begin('card1', 1);
    expect(c.flush('card1')).toBe(1);
    expect(c.isOpen('card1')).toBe(false);
    expect(c.flush('card1')).toBeNull();
    // A new burst starts fresh.
    c.begin('card1', 99);
    expect(c.flush('card1')).toBe(99);
  });

  it('tracks bursts per key independently', () => {
    const c = new BurstCoalescer<string>();
    c.begin('a', 'A0');
    c.begin('b', 'B0');
    expect(c.flush('a')).toBe('A0');
    expect(c.isOpen('b')).toBe(true);
    expect(c.flush('b')).toBe('B0');
  });

  it('cancel discards without returning', () => {
    const c = new BurstCoalescer<number>();
    c.begin('x', 5);
    c.cancel('x');
    expect(c.flush('x')).toBeNull();
  });
});

describe('hasUserContent', () => {
  const base = {
    id: 'c1', user_id: 'u', board_id: 'b', x: 0, y: 0, w: null, h: null,
    z: 0, color: 'paper', board_ref: null, created_at: '', updated_at: '',
  };
  const make = (type: Card['type'], payload: unknown): Card =>
    ({ ...base, type, payload } as Card);

  it('empty defaults have no user content', () => {
    expect(hasUserContent(make('note', { body: '' }))).toBe(false);
    expect(hasUserContent(make('note', { body: '<p><br></p>' }))).toBe(false);
    expect(hasUserContent(make('heading', { body: '' }))).toBe(false);
    expect(hasUserContent(make('todo', { title: 'To-do', items: [{ id: 'i', text: '', done: false }] }))).toBe(false);
    expect(hasUserContent(make('link', { title: '', url: '' }))).toBe(false);
    expect(hasUserContent(make('document', { title: 'Untitled document', body: '', mode: 'icon' }))).toBe(false);
  });

  it('any real content counts', () => {
    expect(hasUserContent(make('note', { body: '<p>hi</p>' }))).toBe(true);
    expect(hasUserContent(make('heading', { body: 'Title' }))).toBe(true);
    expect(hasUserContent(make('todo', { title: 'To-do', items: [{ id: 'i', text: 'milk', done: false }] }))).toBe(true);
    expect(hasUserContent(make('todo', { title: 'To-do', items: [{ id: 'i', text: '', done: true }] }))).toBe(true);
    expect(hasUserContent(make('todo', { title: 'Groceries', items: [] }))).toBe(true);
    expect(hasUserContent(make('link', { title: '', url: 'https://x.dev' }))).toBe(true);
    expect(hasUserContent(make('document', { title: 'My doc', body: '', mode: 'icon' }))).toBe(true);
    expect(hasUserContent(make('document', { title: 'Untitled document', body: '<p>words</p>', mode: 'icon' }))).toBe(true);
  });

  it('is conservative for board tiles and unknown types', () => {
    expect(hasUserContent(make('board', { name: 'Anything' }))).toBe(true);
  });
});
