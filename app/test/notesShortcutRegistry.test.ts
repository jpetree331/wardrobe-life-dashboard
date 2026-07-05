import { describe, it, expect } from 'vitest';
import { findShortcutCollisions, SHORTCUTS } from '../src/lib/notesShortcutRegistry';

describe('shortcut registry hygiene', () => {
  it('has no duplicate key-combo collisions', () => {
    expect(findShortcutCollisions()).toEqual([]);
  });

  it('every entry carries keys, label, and category', () => {
    for (const def of SHORTCUTS) {
      expect(def.id).toBeTruthy();
      expect(def.keys.length).toBeGreaterThan(0);
      expect(def.label).toBeTruthy();
      expect(def.category).toBeTruthy();
    }
  });

  it('ids are unique', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
