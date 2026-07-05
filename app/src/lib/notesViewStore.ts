// Per-board view persistence for the Notes canvas. The saved pan/zoom is
// device-local ephemera (not worth a migration), so it lives in localStorage
// under one key per board. Parsing is a pure function so the validation and
// clamping rules are unit-testable.

import { clampZoom, type View } from './notesPanZoom';

export const VIEW_STORE_PREFIX = 'notes-view-';

/**
 * Parse a raw localStorage value into a View. Returns null for anything
 * malformed — corrupt JSON, missing/non-finite fields — so callers fall back
 * to the fit-or-identity default. Zoom is clamped to the canvas range.
 */
export function parseSavedView(raw: string | null): View | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const { x, y, k } = obj as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof k !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(k)) return null;
  return { x, y, k: clampZoom(k) };
}

export function loadSavedView(boardId: string): View | null {
  try {
    return parseSavedView(window.localStorage.getItem(VIEW_STORE_PREFIX + boardId));
  } catch {
    return null; // storage unavailable (private mode etc.)
  }
}

export function saveSavedView(boardId: string, view: View): void {
  try {
    window.localStorage.setItem(VIEW_STORE_PREFIX + boardId, JSON.stringify(view));
  } catch {
    // Best-effort; losing the saved view is harmless.
  }
}
