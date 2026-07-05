import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildNotesExtensions } from '../src/lib/notesEditor';

// These tests pin the LIVE editor DOM shape our CSS depends on. TipTap's
// TaskItem NodeView renders the live <li> WITHOUT data-type="taskItem"
// (only serialized HTML has it) — Notes.css therefore anchors task-item
// rules on ul[data-type="taskList"]. If a TipTap upgrade changes this,
// these tests fail before the styling silently breaks.

let host: HTMLDivElement;
let editor: Editor;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  editor = new Editor({
    element: host,
    extensions: buildNotesExtensions('test') as any,
    content: '<p>test</p>',
  });
});
afterEach(() => {
  editor.destroy();
  host.remove();
});

describe('task lists', () => {
  it('toggleTaskList produces a live DOM our CSS selectors match', () => {
    editor.commands.selectAll();
    expect(editor.commands.toggleTaskList()).toBe(true);
    const pm = host.querySelector('.ProseMirror')!;
    const ul = pm.querySelector('ul[data-type="taskList"]');
    expect(ul, 'live UL must keep data-type="taskList"').toBeTruthy();
    const li = ul!.querySelector(':scope > li')!;
    expect(li).toBeTruthy();
    // Document the NodeView quirk that broke the original styling:
    expect(li.getAttribute('data-type')).toBeNull();
    expect(li.getAttribute('data-checked')).toBe('false');
    // Structure the flex layout relies on: label (checkbox) + content div.
    expect(li.querySelector(':scope > label > input[type="checkbox"]')).toBeTruthy();
    expect(li.querySelector(':scope > div > p')?.textContent).toBe('test');
  });

  it('serialized HTML keeps data-type="taskItem" (markdown export relies on it)', () => {
    editor.commands.selectAll();
    editor.commands.toggleTaskList();
    expect(editor.getHTML()).toContain('data-type="taskItem"');
  });
});

describe('marks and blocks the toolbar exposes', () => {
  it('blockquote, inline code, and highlight toggle on a selection', () => {
    editor.commands.selectAll();
    expect(editor.commands.toggleBlockquote()).toBe(true);
    expect(editor.getHTML()).toContain('<blockquote>');
    editor.commands.setContent('<p>some code</p>');
    editor.commands.selectAll();
    expect(editor.commands.toggleCode()).toBe(true);
    expect(editor.getHTML()).toContain('<code>');
    editor.commands.setContent('<p>bright</p>');
    editor.commands.selectAll();
    expect(editor.commands.toggleHighlight()).toBe(true);
    expect(editor.getHTML()).toContain('<mark>');
  });

  it('legacy execCommand-era HTML loads losslessly', () => {
    const legacy = '<h1>Title</h1><p><b>bold</b> and <i>italic</i></p><ul><li>x</li></ul><blockquote>q</blockquote>';
    editor.commands.setContent(legacy);
    const html = editor.getHTML();
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<li><p>x</p></li>');
    expect(html).toContain('<blockquote>');
  });
});
