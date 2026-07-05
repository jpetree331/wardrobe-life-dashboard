import { describe, it, expect } from 'vitest';
import {
  boardToMarkdown,
  contentBBox,
  htmlToMarkdown,
  sanitizeFilename,
} from '../src/lib/notesExport';
import type { Card } from '../src/lib/notes';

describe('contentBBox', () => {
  it('frames all rects with padding', () => {
    const box = contentBBox([
      { x: 100, y: 50, w: 200, h: 100 },
      { x: 500, y: 300, w: 100, h: 100 },
    ], 60)!;
    expect(box).toEqual({ x: 40, y: -10, w: 620, h: 470 });
  });
  it('returns null for an empty board', () => {
    expect(contentBBox([])).toBeNull();
  });
});

describe('sanitizeFilename', () => {
  it('strips forbidden characters and trims', () => {
    expect(sanitizeFilename('  My: Board / "v2"?  ')).toBe('My Board v2');
    expect(sanitizeFilename('///')).toBe('board');
  });
});

describe('htmlToMarkdown', () => {
  it('converts headings, emphasis, links, and paragraphs', () => {
    const md = htmlToMarkdown('<h1>Title</h1><p>Some <strong>bold</strong> and <em>italic</em> with a <a href="https://x.dev">link</a>.</p>');
    expect(md).toContain('# Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
    expect(md).toContain('[link](https://x.dev)');
  });
  it('converts lists, task lists, quotes, and code blocks', () => {
    const md = htmlToMarkdown(
      '<ul><li>a</li><li>b</li></ul>' +
      '<ol><li>one</li></ol>' +
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label></label><div><p>done it</p></div></li></ul>' +
      '<blockquote><p>quoted</p></blockquote>' +
      '<pre><code>x = 1</code></pre>',
    );
    expect(md).toContain('- a\n- b');
    expect(md).toContain('1. one');
    expect(md).toContain('- [x] done it');
    expect(md).toContain('> quoted');
    expect(md).toContain('```\nx = 1\n```');
  });
  it('handles strike, code, mark, and line breaks', () => {
    const md = htmlToMarkdown('<p><s>old</s> <code>fn()</code> <mark>hi</mark>line1<br>line2</p>');
    expect(md).toContain('~~old~~');
    expect(md).toContain('`fn()`');
    expect(md).toContain('==hi==');
    expect(md).toContain('line1\nline2');
  });
  it('returns empty for empty input', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown('<p></p>')).toBe('');
  });
});

describe('boardToMarkdown', () => {
  const base = {
    id: '', user_id: 'u', board_id: 'b', z: 0, w: null, h: null, color: 'paper' as const,
    board_ref: null, parent_column: null, column_index: null, created_at: '', updated_at: '',
  };
  const card = (id: string, type: Card['type'], payload: unknown, x = 0, y = 0): Card =>
    ({ ...base, id, type, payload, x, y } as Card);

  it('renders columns as sections with members, then free cards in reading order', () => {
    const col = card('col', 'column', { title: 'Research' }, 0, 0);
    const member = card('m', 'todo', { title: 'To-do', items: [{ id: '1', text: 'read', done: false }] });
    const note = card('n', 'note', { body: '<p>Loose note</p>' }, 10, 500);
    const link = card('l', 'link', { title: 'Docs', url: 'https://docs.dev' }, 10, 100);
    const md = boardToMarkdown('My Board', [col, note, link], (id) => (id === 'col' ? [member] : []));
    expect(md.startsWith('# My Board')).toBe(true);
    expect(md).toContain('## Research');
    expect(md).toContain('- [ ] read');
    expect(md).toContain('## Cards');
    // Reading order: link (y=100) before note (y=500).
    expect(md.indexOf('[Docs](https://docs.dev)')).toBeLessThan(md.indexOf('Loose note'));
  });

  it('handles a board with no columns', () => {
    const md = boardToMarkdown('Flat', [card('n', 'note', { body: '<p>only</p>' })], () => []);
    expect(md).toContain('# Flat');
    expect(md).toContain('only');
    expect(md).not.toContain('## Cards');
  });
});
