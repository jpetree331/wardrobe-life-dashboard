// Undo/redo command layer for the Notes room.
//
// ── API CONTRACT ────────────────────────────────────────────────────────
// Every canvas mutation flows through a Command pushed onto the current
// board's BoardHistory. The convention is PUSH-AFTER-APPLY: the caller
// performs the mutation optimistically (local state + Supabase), then calls
// history.push(cmd) with a command able to revert it (undo) and re-apply it
// (do — used for redo). push() never executes the command.
//
//   history.push({
//     label: 'Move 3 cards',
//     undo: async () => { ...restore previous state... },
//     do:   async () => { ...re-apply the mutation... },
//   });
//
// Granularity rules (established Sprint 3 — keep future sprints consistent):
//   • Move/resize: one command per gesture (mouse-down → mouse-up).
//   • Text/payload edits: coalesced per editing burst — one command per
//     debounce-flush of a given card (BurstCoalescer below).
//   • Group operations: ONE composite command for the whole group.
//   • Delete: undo restores the card row AND removes its trash row (no
//     ghost trash entries); redo re-trashes. THE TRASH REMAINS THE
//     PERMANENT SAFETY NET — history is the fast in-session path only.
//   • Create: undo hard-removes only if the card has no user content at
//     undo time (hasUserContent below); otherwise it soft-deletes to honor
//     divergence rule 1 (nothing with content ever bypasses the trash).
//   • Board-tile deletes are NOT undoable until board-subtree restore
//     exists (Sprint 18); they go to trash as always.
//
// Stacks are in-memory, per board, session-scoped (a refresh clears them —
// deliberate: cross-session recovery is the trash's job), capped at
// MAX_HISTORY entries (oldest dropped).
// ────────────────────────────────────────────────────────────────────────

import type { Card, TodoItem } from './notes';

export type Command = {
  label: string;
  /** Re-apply the mutation (redo path). */
  do: () => void | Promise<void>;
  /** Revert the mutation. */
  undo: () => void | Promise<void>;
};

export const MAX_HISTORY = 100;

export class BoardHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  /** Serializes async undo/redo — ignore requests while one is in flight. */
  private busy = false;
  /** Notifies the UI (ribbon buttons) after any stack change. */
  onChange: (() => void) | null = null;

  constructor(private cap: number = MAX_HISTORY) {}

  /** Record an already-applied mutation. Clears the redo stack. */
  push(cmd: Command): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.cap) this.undoStack.shift();
    this.redoStack = [];
    this.onChange?.();
  }

  canUndo(): boolean { return this.undoStack.length > 0 && !this.busy; }
  canRedo(): boolean { return this.redoStack.length > 0 && !this.busy; }
  peekUndoLabel(): string | null { return this.undoStack[this.undoStack.length - 1]?.label ?? null; }
  peekRedoLabel(): string | null { return this.redoStack[this.redoStack.length - 1]?.label ?? null; }
  get depth(): number { return this.undoStack.length; }

  async undo(): Promise<Command | null> {
    if (!this.canUndo()) return null;
    const cmd = this.undoStack.pop()!;
    this.busy = true;
    this.onChange?.();
    try {
      await cmd.undo();
      this.redoStack.push(cmd);
      return cmd;
    } catch (err) {
      // A failed undo drops the command rather than leaving history
      // pointing at state it no longer describes.
      console.error('undo failed:', err);
      return null;
    } finally {
      this.busy = false;
      this.onChange?.();
    }
  }

  async redo(): Promise<Command | null> {
    if (!this.canRedo()) return null;
    const cmd = this.redoStack.pop()!;
    this.busy = true;
    this.onChange?.();
    try {
      await cmd.do();
      this.undoStack.push(cmd);
      return cmd;
    } catch (err) {
      console.error('redo failed:', err);
      return null;
    } finally {
      this.busy = false;
      this.onChange?.();
    }
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange?.();
  }
}

/**
 * Coalesces an editing burst per key (card id): `begin` captures the
 * before-state once per burst; `flush` returns it and closes the burst.
 * The caller pairs the returned before-state with the current after-state
 * to build one command per burst.
 */
export class BurstCoalescer<T> {
  private open = new Map<string, T>();

  /** Open a burst with the pre-edit snapshot; no-op if one is open. */
  begin(key: string, before: T): void {
    if (!this.open.has(key)) this.open.set(key, before);
  }

  isOpen(key: string): boolean {
    return this.open.has(key);
  }

  /** Close the burst and return its before-snapshot (null if none open). */
  flush(key: string): T | null {
    const before = this.open.get(key);
    this.open.delete(key);
    return before === undefined ? null : before;
  }

  cancel(key: string): void {
    this.open.delete(key);
  }

  clear(): void {
    this.open.clear();
  }
}

/**
 * Does a card carry user-entered content? Decides whether undoing its
 * creation may hard-remove it (no content — it effectively never existed)
 * or must soft-delete through the trash (divergence rule 1).
 * Conservative: unknown types count as having content.
 */
export function hasUserContent(card: Card): boolean {
  const p = card.payload as Record<string, unknown>;
  const text = (html: unknown) =>
    typeof html === 'string' ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  switch (card.type) {
    case 'note':
    case 'heading':
      return text(p.body).length > 0;
    case 'todo': {
      const items = (p.items as TodoItem[] | undefined) ?? [];
      const titleTouched = typeof p.title === 'string' && p.title !== 'To-do' && p.title.trim() !== '';
      return titleTouched || items.some((it) => it.text.trim() !== '' || it.done);
    }
    case 'link':
      return Boolean((p.title as string)?.trim() || (p.url as string)?.trim());
    case 'document': {
      const titleTouched =
        typeof p.title === 'string' && p.title !== 'Untitled document' && p.title.trim() !== '';
      return titleTouched || text(p.body).length > 0;
    }
    default:
      return true;
  }
}
