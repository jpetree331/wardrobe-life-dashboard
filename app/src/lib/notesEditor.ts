// Shared TipTap configuration for the Notes room (Sprint 12). One config
// module feeds both the inline note-body editor and the document-overlay
// editor so their markdown rules, marks, and behavior never drift.
//
// HISTORY CONTRACT (Sprint 3 + 12): TipTap's own history stays ENABLED so
// Cmd/Ctrl+Z inside a focused editor does native-feeling text undo (the
// global canvas handler is typing-suppressed). The debounced save flush
// still pushes ONE coalesced burst command per card to notesHistory —
// that layer owns cross-card, canvas-level undo.
//
// Markdown input rules (all built-in or via extensions):
//   #, ##, ###   → headings          -, *        → bullet list
//   1.           → ordered list      >           → blockquote
//   **b**, *i*, ~~s~~, `code` as you type
//   ```          → code block        [ ] / - [ ] → task item

import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import type { Editor, Extensions } from '@tiptap/react';

export function buildNotesExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Underline,
    Link.configure({
      // Clicking a link in a note opens it (new tab, noopener) — the
      // card-drag handler already ignores mousedown on <a>.
      openOnClick: true,
      autolink: true,
      HTMLAttributes: { target: '_blank', rel: 'noopener nofollow' },
    }),
    Highlight,
    TaskList,
    TaskItem.configure({ nested: false }),
    Placeholder.configure({ placeholder }),
  ];
}

// ── Active-editor registry ──────────────────────────────────────────────
// The floating format toolbar is a single global surface; it dispatches
// commands to whichever editor holds focus.

let activeEditor: Editor | null = null;

export function setActiveEditor(editor: Editor | null): void {
  activeEditor = editor;
}

export function clearActiveEditor(editor: Editor): void {
  if (activeEditor === editor) activeEditor = null;
}

export function getActiveEditor(): Editor | null {
  return activeEditor;
}

/** Toolbar action ids → TipTap commands. */
export function runEditorAction(editor: Editor, action: string): void {
  const chain = editor.chain().focus();
  switch (action) {
    case 'bold':        chain.toggleBold().run(); break;
    case 'italic':      chain.toggleItalic().run(); break;
    case 'underline':   chain.toggleUnderline().run(); break;
    case 'strike':      chain.toggleStrike().run(); break;
    case 'highlight':   chain.toggleHighlight().run(); break;
    case 'code':        chain.toggleCode().run(); break;
    case 'codeblock':   chain.toggleCodeBlock().run(); break;
    case 'h1':          chain.toggleHeading({ level: 1 }).run(); break;
    case 'h2':          chain.toggleHeading({ level: 2 }).run(); break;
    case 'bullet':      chain.toggleBulletList().run(); break;
    case 'ordered':     chain.toggleOrderedList().run(); break;
    case 'blockquote':  chain.toggleBlockquote().run(); break;
    case 'task':        chain.toggleTaskList().run(); break;
    case 'link': {
      const existing = editor.getAttributes('link').href as string | undefined;
      const url = window.prompt('Link URL', existing ?? 'https://');
      if (url === null) break; // cancelled
      if (url.trim() === '') chain.unsetLink().run();
      else chain.extendMarkRange('link').setLink({ href: url.trim() }).run();
      break;
    }
  }
}
