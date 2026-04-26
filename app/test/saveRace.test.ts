// Unit-test the sequence-guard pattern that scheduleSave uses to defend
// against out-of-order save responses. We don't render the React component
// here — we test the underlying invariant directly.
//
// The pattern: two awaits go out (A then B); B resolves first; A resolves
// after. Only B's result should "win" — A must be discarded.

import { describe, it, expect } from 'vitest';

function makeRunner() {
  // Mirrors the seq logic inside scheduleSave verbatim.
  let saveSeq = 0;
  let lastApplied = 0;
  let appliedValue: string | null = null;

  return {
    async run(value: string, op: () => Promise<string>) {
      const mySeq = ++saveSeq;
      const result = await op();
      if (mySeq < lastApplied) return; // newer save already won
      lastApplied = mySeq;
      appliedValue = result;
    },
    get value() { return appliedValue; },
    get applied() { return lastApplied; },
  };
}

function defer<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('save sequence guard', () => {
  it('discards an older response that arrives after a newer one', async () => {
    const r = makeRunner();
    const aResp = defer<string>();
    const bResp = defer<string>();

    // A goes out first.
    const aDone = r.run('A', () => aResp.promise);
    // B goes out second.
    const bDone = r.run('B', () => bResp.promise);

    // B's response arrives first.
    bResp.resolve('B-server');
    await bDone;
    expect(r.value).toBe('B-server');
    expect(r.applied).toBe(2);

    // A's response arrives later — must be discarded.
    aResp.resolve('A-server');
    await aDone;
    expect(r.value).toBe('B-server');
    expect(r.applied).toBe(2);
  });

  it('applies an older response if no newer one has won yet', async () => {
    const r = makeRunner();
    const aResp = defer<string>();
    const bResp = defer<string>();

    const aDone = r.run('A', () => aResp.promise);
    const bDone = r.run('B', () => bResp.promise);

    // A arrives first this time.
    aResp.resolve('A-server');
    await aDone;
    expect(r.value).toBe('A-server');
    expect(r.applied).toBe(1);

    // B arrives second — this is the latest, also applied.
    bResp.resolve('B-server');
    await bDone;
    expect(r.value).toBe('B-server');
    expect(r.applied).toBe(2);
  });

  it('handles three overlapping saves with the latest winning', async () => {
    const r = makeRunner();
    const a = defer<string>();
    const b = defer<string>();
    const c = defer<string>();

    const aDone = r.run('A', () => a.promise);
    const bDone = r.run('B', () => b.promise);
    const cDone = r.run('C', () => c.promise);

    // C arrives first.
    c.resolve('C');
    await cDone;
    expect(r.value).toBe('C');

    // A arrives second (older — discarded).
    a.resolve('A');
    await aDone;
    expect(r.value).toBe('C');

    // B arrives third (older — discarded).
    b.resolve('B');
    await bDone;
    expect(r.value).toBe('C');
  });
});
