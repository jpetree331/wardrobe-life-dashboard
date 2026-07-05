// Central registry of every Notes-room keyboard shortcut. This is the single
// source of truth the (future) "?" help overlay renders from — when a sprint
// adds a shortcut, it adds an entry here alongside the handler wiring.
//
// The registry is declarative only: it names the action and its key combo(s)
// for display and collision-checking. The actual handlers live in Notes.tsx
// (or hooks), keyed by `id`. `when` describes the context the shortcut is
// active in, both for documentation and for grouping in the overlay.

export type ShortcutCategory =
  | 'Canvas'
  | 'Selection'
  | 'View'
  | 'Editing';

export type ShortcutDef = {
  /** Stable action id, e.g. 'zoom-in'. Handlers are wired by this id. */
  id: string;
  /**
   * Display combos. 'Mod' means Cmd on macOS / Ctrl elsewhere. Multiple
   * entries are alternates for the same action.
   */
  keys: string[];
  label: string;
  category: ShortcutCategory;
  /** Context requirement, e.g. 'card selected', 'not typing'. */
  when?: string;
};

export const SHORTCUTS: ShortcutDef[] = [
  // ── View ────────────────────────────────────────────────────────────
  { id: 'zoom-in',     keys: ['Mod +'],        label: 'Zoom in',                    category: 'View', when: 'not typing' },
  { id: 'zoom-out',    keys: ['Mod -'],        label: 'Zoom out',                   category: 'View', when: 'not typing' },
  { id: 'zoom-100',    keys: ['Mod 0'],        label: 'Zoom to 100%, centered on content', category: 'View', when: 'not typing' },
  { id: 'zoom-fit',    keys: ['Mod Shift 0'],  label: 'Fit all cards in view',      category: 'View', when: 'not typing' },

  // ── Editing ─────────────────────────────────────────────────────────
  { id: 'undo',        keys: ['Mod Z'],            label: 'Undo',                     category: 'Editing', when: 'not typing' },
  { id: 'redo',        keys: ['Mod Shift Z', 'Ctrl Y'], label: 'Redo',                category: 'Editing', when: 'not typing' },

  // ── Selection ───────────────────────────────────────────────────────
  { id: 'select-all',  keys: ['Mod A'],            label: 'Select all cards on the board', category: 'Selection', when: 'not typing' },
  { id: 'duplicate',   keys: ['Mod D'],            label: 'Duplicate selection',      category: 'Selection', when: 'selection, not typing' },
  { id: 'copy',        keys: ['Mod C'],            label: 'Copy selection (paste on any board)', category: 'Selection', when: 'selection, not typing' },
  { id: 'cut',         keys: ['Mod X'],            label: 'Cut selection',            category: 'Selection', when: 'selection, not typing' },
  { id: 'paste',       keys: ['Mod V'],            label: 'Paste cards, files, URLs, or text', category: 'Canvas', when: 'not typing' },
  { id: 'toggle-select', keys: ['Shift Click', 'Mod Click'], label: 'Add / remove a card from the selection', category: 'Selection' },
  { id: 'nudge',       keys: ['Arrow keys'],       label: 'Nudge selection 1px',      category: 'Selection', when: 'selection, not typing' },
  { id: 'nudge-fast',  keys: ['Shift Arrow keys'], label: 'Nudge selection 10px',     category: 'Selection', when: 'selection, not typing' },
  { id: 'delete',      keys: ['Delete'],           label: 'Move selection to trash',  category: 'Selection', when: 'selection, not typing' },

  // ── Canvas ──────────────────────────────────────────────────────────
  { id: 'marquee',     keys: ['Drag empty canvas'], label: 'Marquee select',          category: 'Canvas' },
  { id: 'pan',         keys: ['Space Drag', 'Middle-mouse Drag'], label: 'Pan the canvas', category: 'Canvas' },
  { id: 'escape',      keys: ['Esc'],          label: 'Exit editing / close menu, overlay, trash / deselect', category: 'Canvas' },
];

/**
 * Find key-combo collisions: two different actions registered to the same
 * combo. Contexts are not modeled yet (Sprint 13 refines `when` into a real
 * context key); until then any duplicate combo string counts as a collision.
 */
export function findShortcutCollisions(defs: ShortcutDef[] = SHORTCUTS): string[] {
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const def of defs) {
    for (const combo of def.keys) {
      const norm = combo.trim().toLowerCase();
      const owner = seen.get(norm);
      if (owner && owner !== def.id) collisions.push(`${combo} → ${owner} vs ${def.id}`);
      else seen.set(norm, def.id);
    }
  }
  return collisions;
}
