import { describe, it, expect } from 'vitest';
import { parseEsvPassage } from '../src/lib/esvParse';

describe('parseEsvPassage', () => {
  it('parses a normal multi-verse passage with bracketed markers', () => {
    const text = `
      Luke 24:13-15

      [13] That very day two of them were going to a village named Emmaus, about seven miles from Jerusalem,
      [14] and they were talking with each other about all these things that had happened.
      [15] While they were talking and discussing together, Jesus himself drew near and went with them.
    `;
    const verses = parseEsvPassage(text, 'Luke 24:13–15');

    expect(verses).toHaveLength(3);
    expect(verses[0]).toMatchObject({ book: 'Luke', chapter: 24, verse: 13 });
    expect(verses[0].text).toContain('seven miles from Jerusalem');
    expect(verses[1].verse).toBe(14);
    expect(verses[2].verse).toBe(15);
  });

  it('extracts book and chapter from the reference, not the passage', () => {
    const text = '[1] In the beginning God created the heavens and the earth.';
    const verses = parseEsvPassage(text, 'Genesis 1:1');
    expect(verses[0].book).toBe('Genesis');
    expect(verses[0].chapter).toBe(1);
    expect(verses[0].verse).toBe(1);
  });

  it('handles multi-word book names', () => {
    const text = '[1] Paul, an apostle of Christ Jesus by the will of God.';
    const verses = parseEsvPassage(text, '1 Corinthians 1:1');
    expect(verses[0].book).toBe('1 Corinthians');
    expect(verses[0].chapter).toBe(1);
  });

  it('handles em dashes and en dashes in the verse range', () => {
    const text = '[13] one [14] two [15] three';
    const verses = parseEsvPassage(text, 'Luke 24:13—15');
    expect(verses).toHaveLength(3);
    expect(verses[0].book).toBe('Luke');
    expect(verses[0].chapter).toBe(24);
  });

  it('synthesises a single verse when the text has no brackets at all', () => {
    const verses = parseEsvPassage('Plain text with no markers', 'Psalm 23:1');
    expect(verses).toHaveLength(1);
    expect(verses[0]).toEqual({
      book: 'Psalm',
      chapter: 23,
      verse: 0,
      text: 'Plain text with no markers',
    });
  });

  it('returns empty array for empty input', () => {
    expect(parseEsvPassage('', 'Luke 24:13')).toEqual([]);
    expect(parseEsvPassage('   ', 'Luke 24:13')).toEqual([]);
  });

  it('skips empty verse bodies between markers', () => {
    const text = '[1] [2] real verse [3]';
    const verses = parseEsvPassage(text, 'Genesis 1:1');
    expect(verses).toHaveLength(1);
    expect(verses[0].verse).toBe(2);
    expect(verses[0].text).toBe('real verse');
  });

  it('collapses internal whitespace', () => {
    const text = '[1]   word\n\n   another   word.   ';
    const verses = parseEsvPassage(text, 'Genesis 1:1');
    expect(verses[0].text).toBe('word another word.');
  });

  it('falls back to empty book/chapter when reference is malformed', () => {
    const text = '[1] something';
    const verses = parseEsvPassage(text, 'not a reference');
    expect(verses[0]).toMatchObject({ book: '', chapter: 0, verse: 1 });
  });
});
