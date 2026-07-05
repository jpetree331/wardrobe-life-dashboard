import { describe, it, expect } from 'vitest';
import {
  cardsPlainTextDigest,
  classifyClipboard,
  hasRichMarkup,
  NOTE_TO_DOC_AT,
  parseSerializedCards,
  sanitizeHtmlFragment,
  serializeCards,
  splitTitleBody,
  textToNoteHtml,
} from '../src/lib/notesClipboard';
import type { Card } from '../src/lib/notes';

describe('classifyClipboard', () => {
  const c = (fileCount: number, text = '', html = '') => classifyClipboard({ fileCount, text, html });

  it('files beat everything (mixed clipboard prefers the richer type)', () => {
    expect(c(2, 'some text', '<b>rich</b>').kind).toBe('files');
  });
  it('bare URLs become link intents', () => {
    expect(c(0, ' https://example.com/x ')).toEqual({ kind: 'url', url: 'https://example.com/x' });
  });
  it('prose with a URL inside is NOT a link', () => {
    expect(c(0, 'see https://example.com for details').kind).toBe('note-text');
  });
  it('short text → note, long text → document', () => {
    expect(c(0, 'three short sentences.').kind).toBe('note-text');
    expect(c(0, 'w'.repeat(NOTE_TO_DOC_AT + 1)).kind).toBe('document-text');
  });
  it('rich html routes to note or document by length', () => {
    expect(c(0, 'short', '<p>a</p><p><strong>b</strong></p>').kind).toBe('html-note');
    expect(c(0, 'x'.repeat(700), '<p><em>long</em></p>').kind).toBe('html-document');
  });
  it('plain-text-ish html falls back to text routing', () => {
    expect(c(0, 'hello', '<div>hello</div>').kind).toBe('note-text');
  });
  it('empty clipboard → none', () => {
    expect(c(0, '  ', '').kind).toBe('none');
  });
});

describe('hasRichMarkup', () => {
  it('detects formatting tags and multi-block structure', () => {
    expect(hasRichMarkup('<strong>x</strong>')).toBe(true);
    expect(hasRichMarkup('<ul><li>x</li></ul>')).toBe(true);
    expect(hasRichMarkup('<div>a</div><div>b</div>')).toBe(true);
  });
  it('ignores bare wrappers', () => {
    expect(hasRichMarkup('<div>plain</div>')).toBe(false);
    expect(hasRichMarkup('')).toBe(false);
  });
});

describe('sanitizeHtmlFragment', () => {
  it('strips scripts, styles, and wrapper tags', () => {
    const dirty = '<html><body><script>evil()</script><style>.x{}</style><p>ok</p></body></html>';
    expect(sanitizeHtmlFragment(dirty)).toBe('<p>ok</p>');
  });
  it('strips all attributes except safe hrefs', () => {
    const dirty = '<p class="x" onclick="evil()" style="color:red">t</p><a href="https://a.dev" target="_blank">l</a><a href="javascript:evil()">bad</a>';
    expect(sanitizeHtmlFragment(dirty)).toBe('<p>t</p><a href="https://a.dev">l</a><a>bad</a>');
  });
});

describe('text conversion', () => {
  it('textToNoteHtml escapes and paragraphs', () => {
    expect(textToNoteHtml('a <b>\n\nc')).toBe('<p>a &lt;b&gt;</p><p>c</p>');
    expect(textToNoteHtml('line1\nline2')).toBe('<p>line1<br>line2</p>');
  });
  it('splitTitleBody uses the first line as the title', () => {
    const { title, bodyHtml } = splitTitleBody('My Title\nBody line one.\n\nBody two.');
    expect(title).toBe('My Title');
    expect(bodyHtml).toBe('<p>Body line one.</p><p>Body two.</p>');
  });
  it('splitTitleBody keeps an over-long first line in the body', () => {
    const long = 'x'.repeat(120) + '\nrest';
    const { title, bodyHtml } = splitTitleBody(long);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(bodyHtml).toContain('x'.repeat(120));
  });
});

describe('serialize / parse round-trip', () => {
  const base = {
    id: '', user_id: 'u', board_id: 'b', z: 0, board_ref: null,
    parent_column: null, column_index: null, created_at: '', updated_at: '',
  };
  const card = (id: string, over: Partial<Card>): Card =>
    ({ ...base, id, type: 'note', x: 0, y: 0, w: 200, h: 100, color: 'paper', payload: { body: '' }, ...over } as Card);

  it('normalizes positions to the bbox origin and carries column members', () => {
    const col = card('col', { type: 'column', x: 500, y: 300, payload: { title: 'T' } });
    const note = card('n', { x: 100, y: 100, payload: { body: '<p>hi</p>' } });
    const member = card('m', { parent_column: 'col', column_index: 0, payload: { body: '<p>in</p>' } });
    const data = serializeCards([note, col], (id) => (id === 'col' ? [member] : []));
    expect(data.items[0]).toMatchObject({ dx: 0, dy: 0 });
    expect(data.items[1]).toMatchObject({ dx: 400, dy: 200 });
    expect(data.items[1].members).toHaveLength(1);

    const round = parseSerializedCards(JSON.stringify(data));
    expect(round?.items).toHaveLength(2);
  });

  it('parse rejects foreign payloads', () => {
    expect(parseSerializedCards('{"kind":"other"}')).toBeNull();
    expect(parseSerializedCards('not json')).toBeNull();
  });
});

describe('cardsPlainTextDigest', () => {
  const base = {
    id: '', user_id: 'u', board_id: 'b', z: 0, board_ref: null, x: 0, y: 0,
    w: null, h: null, color: 'paper' as const,
    parent_column: null, column_index: null, created_at: '', updated_at: '',
  };
  it('renders a readable fallback', () => {
    const todo = { ...base, id: 't', type: 'todo', payload: { title: 'List', items: [{ id: '1', text: 'a', done: true }] } } as Card;
    const link = { ...base, id: 'l', type: 'link', payload: { title: 'Site', url: 'https://x.dev' } } as Card;
    const digest = cardsPlainTextDigest([todo, link], () => []);
    expect(digest).toContain('List');
    expect(digest).toContain('[x] a');
    expect(digest).toContain('Site — https://x.dev');
  });
});
