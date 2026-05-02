import { describe, it, expect } from 'vitest';
import {
  parseBibleRef,
  parseBibleRefList,
  resolveBookName,
  versesIn,
} from '../src/lib/bibleRef';
import {
  BIBLE_BOOKS,
  totalVersesInBook,
  verseCount,
  VERSE_COUNTS,
} from '../src/lib/bibleVerseCounts';

describe('VERSE_COUNTS manifest sanity', () => {
  it('covers all 66 canonical books', () => {
    expect(BIBLE_BOOKS).toHaveLength(66);
    for (const b of BIBLE_BOOKS) {
      expect(VERSE_COUNTS[b], `verse counts missing for ${b}`).toBeDefined();
    }
  });

  it('totals 31,102 verses across the whole Bible', () => {
    // The KJV's canonical total. Independent check: if any chapter count
    // is wrong in this manifest, this assertion fails — turning a
    // typo-prone data table into something whose mistakes can't hide.
    const total = BIBLE_BOOKS.reduce((sum, book) => sum + totalVersesInBook(book), 0);
    expect(total).toBe(31102);
  });

  it('totals 1189 chapters across the whole Bible', () => {
    let count = 0;
    for (const book of BIBLE_BOOKS) {
      count += VERSE_COUNTS[book].length - 1; // leading-zero sentinel
    }
    expect(count).toBe(1189);
  });

  it('Psalm 119 is the longest chapter at 176 verses', () => {
    expect(verseCount('Psalms', 119)).toBe(176);
  });

  it('Psalm 117 is the shortest chapter at 2 verses', () => {
    expect(verseCount('Psalms', 117)).toBe(2);
  });

  it('verseCount returns 0 for unknown books or out-of-range chapters', () => {
    expect(verseCount('Hezekiah', 1)).toBe(0);
    expect(verseCount('Genesis', 51)).toBe(0);
    expect(verseCount('Genesis', 0)).toBe(0);
  });
});

describe('resolveBookName', () => {
  it('accepts canonical names regardless of case', () => {
    expect(resolveBookName('Genesis')).toBe('Genesis');
    expect(resolveBookName('GENESIS')).toBe('Genesis');
    expect(resolveBookName('genesis')).toBe('Genesis');
  });

  it('accepts trailing periods', () => {
    expect(resolveBookName('Gen.')).toBe('Genesis');
    expect(resolveBookName('Phil.')).toBe('Philippians');
  });

  it('accepts numbered books with a leading digit', () => {
    expect(resolveBookName('1 Corinthians')).toBe('1 Corinthians');
    expect(resolveBookName('1 Cor')).toBe('1 Corinthians');
    expect(resolveBookName('1Cor')).toBe('1 Corinthians');
  });

  it('accepts roman-numeral prefixes (I, II, III)', () => {
    expect(resolveBookName('I Sam')).toBe('1 Samuel');
    expect(resolveBookName('II Cor')).toBe('2 Corinthians');
    expect(resolveBookName('III John')).toBe('3 John');
  });

  it('handles common Psalms / Song variants', () => {
    expect(resolveBookName('Ps')).toBe('Psalms');
    expect(resolveBookName('Psalm')).toBe('Psalms');
    expect(resolveBookName('Song of Songs')).toBe('Song of Solomon');
  });

  it('returns null for unknown input', () => {
    expect(resolveBookName('Hezekiah')).toBeNull();
    expect(resolveBookName('')).toBeNull();
    expect(resolveBookName('???')).toBeNull();
  });
});

describe('parseBibleRef', () => {
  it('parses "Luke 24:13-35"', () => {
    expect(parseBibleRef('Luke 24:13-35')).toEqual({
      book: 'Luke', chapter: 24, verseFrom: 13, verseTo: 35,
    });
  });

  it('accepts en-dash and em-dash for verse ranges', () => {
    expect(parseBibleRef('Luke 24:13–35')).toEqual({
      book: 'Luke', chapter: 24, verseFrom: 13, verseTo: 35,
    });
    expect(parseBibleRef('Luke 24:13—35')).toEqual({
      book: 'Luke', chapter: 24, verseFrom: 13, verseTo: 35,
    });
  });

  it('parses a chapter without verses', () => {
    expect(parseBibleRef('Romans 8')).toEqual({ book: 'Romans', chapter: 8 });
  });

  it('parses a single verse', () => {
    expect(parseBibleRef('Genesis 1:1')).toEqual({
      book: 'Genesis', chapter: 1, verseFrom: 1, verseTo: 1,
    });
  });

  it('parses abbreviations and dotted forms', () => {
    expect(parseBibleRef('Ps 23:1-3')).toEqual({
      book: 'Psalms', chapter: 23, verseFrom: 1, verseTo: 3,
    });
    expect(parseBibleRef('1 Cor 13')).toEqual({ book: '1 Corinthians', chapter: 13 });
    expect(parseBibleRef('Heb. 11:1-3')).toEqual({
      book: 'Hebrews', chapter: 11, verseFrom: 1, verseTo: 3,
    });
  });

  it('accepts dot as a chapter:verse separator (Ps 23.1)', () => {
    expect(parseBibleRef('Ps 23.1')).toEqual({
      book: 'Psalms', chapter: 23, verseFrom: 1, verseTo: 1,
    });
  });

  it('returns null on malformed or empty input', () => {
    expect(parseBibleRef('')).toBeNull();
    expect(parseBibleRef('hello')).toBeNull();
    expect(parseBibleRef('Hezekiah 1:1')).toBeNull();
    expect(parseBibleRef('Luke')).toBeNull();           // no chapter
    expect(parseBibleRef('Luke 24:5-3')).toBeNull();   // descending range
  });
});

describe('parseBibleRefList', () => {
  it('parses a comma-separated list', () => {
    const refs = parseBibleRefList('Luke 24:13-35, Romans 8, Ps 23');
    expect(refs).toHaveLength(3);
    expect(refs[0].book).toBe('Luke');
    expect(refs[1].book).toBe('Romans');
    expect(refs[2].book).toBe('Psalms');
  });

  it('drops items that fail to parse', () => {
    const refs = parseBibleRefList('Luke 24, Hezekiah 1, Romans 8');
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.book)).toEqual(['Luke', 'Romans']);
  });

  it('handles semicolons too', () => {
    const refs = parseBibleRefList('Luke 24; Romans 8');
    expect(refs).toHaveLength(2);
  });
});

describe('versesIn', () => {
  it('returns range size when a verse range is given', () => {
    expect(versesIn(
      { book: 'Luke', chapter: 24, verseFrom: 13, verseTo: 35 },
      verseCount,
    )).toBe(23);
  });

  it('returns full chapter count when no range is given', () => {
    expect(versesIn({ book: 'Romans', chapter: 8 }, verseCount)).toBe(39);
  });

  it('returns 0 if the chapter is unknown', () => {
    expect(versesIn({ book: 'Romans', chapter: 99 }, verseCount)).toBe(0);
  });

  it('returns 1 for a single-verse range', () => {
    expect(versesIn(
      { book: 'Genesis', chapter: 1, verseFrom: 1, verseTo: 1 },
      verseCount,
    )).toBe(1);
  });
});
