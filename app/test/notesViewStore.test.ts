import { describe, it, expect, beforeEach } from 'vitest';
import { ZOOM_MAX, ZOOM_MIN } from '../src/lib/notesPanZoom';
import {
  VIEW_STORE_PREFIX,
  loadSavedView,
  parseSavedView,
  saveSavedView,
} from '../src/lib/notesViewStore';

describe('parseSavedView', () => {
  it('parses a valid saved view', () => {
    expect(parseSavedView('{"x":10,"y":-20,"k":1.5}')).toEqual({ x: 10, y: -20, k: 1.5 });
  });

  it('returns null for null / empty / corrupt input', () => {
    expect(parseSavedView(null)).toBeNull();
    expect(parseSavedView('')).toBeNull();
    expect(parseSavedView('not json')).toBeNull();
    expect(parseSavedView('42')).toBeNull();
    expect(parseSavedView('null')).toBeNull();
  });

  it('returns null when fields are missing or non-numeric', () => {
    expect(parseSavedView('{"x":1,"y":2}')).toBeNull();
    expect(parseSavedView('{"x":"1","y":2,"k":1}')).toBeNull();
    expect(parseSavedView('{"x":1,"y":2,"k":null}')).toBeNull();
  });

  it('rejects non-finite numbers', () => {
    expect(parseSavedView('{"x":1e999,"y":0,"k":1}')).toBeNull();
  });

  it('clamps zoom into the canvas range', () => {
    expect(parseSavedView('{"x":0,"y":0,"k":99}')?.k).toBe(ZOOM_MAX);
    expect(parseSavedView('{"x":0,"y":0,"k":0.01}')?.k).toBe(ZOOM_MIN);
  });
});

describe('save/load round-trip', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips a view per board id', () => {
    saveSavedView('board-a', { x: 5, y: 6, k: 0.8 });
    saveSavedView('board-b', { x: -1, y: -2, k: 2 });
    expect(loadSavedView('board-a')).toEqual({ x: 5, y: 6, k: 0.8 });
    expect(loadSavedView('board-b')).toEqual({ x: -1, y: -2, k: 2 });
    expect(loadSavedView('board-c')).toBeNull();
  });

  it('uses the documented key prefix', () => {
    saveSavedView('abc', { x: 0, y: 0, k: 1 });
    expect(window.localStorage.getItem(VIEW_STORE_PREFIX + 'abc')).toBeTruthy();
  });
});
