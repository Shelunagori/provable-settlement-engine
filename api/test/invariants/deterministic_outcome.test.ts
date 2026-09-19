import { describe, expect, it } from 'vitest';
import vectors from '../../../fixtures/fairness-vectors.json';
import {
  computeOutcome,
  formatHundredths,
  isWin,
  outcomeMessage,
  parseHundredths,
  seedHashOf,
} from '../../src/fairness/outcome.js';

/**
 * INVARIANT: an outcome is a pure function of (serverSeed, clientSeed, nonce),
 * and anyone holding those three values reproduces it exactly.
 *
 * The expected values below are a fixed vector, computed independently. They
 * are deliberately NOT derived from the implementation under test: a test that
 * asks the code what it produces and then asserts it produced that will pass
 * for any algorithm, including a wrong one.
 */
const V = vectors.vectors[0]!;

describe('deterministic_outcome', () => {
  it('reproduces the fixed vector exactly', () => {
    expect(outcomeMessage(V.clientSeed, BigInt(V.nonce))).toBe(V.message);

    const outcome = computeOutcome(V.serverSeed, V.clientSeed, BigInt(V.nonce));

    expect(outcome.hmac).toBe(V.hmac);
    expect(outcome.first8).toBe(V.first8);
    expect(outcome.integer).toBe(V.integer);
    expect(outcome.rollHundredths).toBe(V.rollHundredths);
    expect(outcome.roll).toBe(V.roll);
  });

  it('commits to the seed with SHA256 over the same text representation', () => {
    expect(seedHashOf(V.serverSeed)).toBe(V.serverSeedHash);
  });

  it('decides the win strictly, so the boundary is a loss', () => {
    const outcome = computeOutcome(V.serverSeed, V.clientSeed, BigInt(V.nonce));

    for (const b of V.boundary) {
      expect(parseHundredths(b.targetUnder)).toBe(b.targetUnderHundredths);
      expect(isWin(outcome.rollHundredths, b.targetUnderHundredths)).toBe(b.won);
    }

    // Stated without the fixture, so the intent survives a fixture edit:
    // a roll exactly equal to the target does not win.
    expect(isWin(5963, 5963)).toBe(false);
    expect(isWin(5962, 5963)).toBe(true);
    expect(isWin(5963, 5964)).toBe(true);
  });

  it('is deterministic across repeated calls', () => {
    const runs = Array.from({ length: 25 }, () =>
      computeOutcome(V.serverSeed, V.clientSeed, BigInt(V.nonce)),
    );
    for (const r of runs) {
      expect(r).toEqual(runs[0]);
    }
    expect(runs[0]!.hmac).toBe(V.hmac);
  });

  it('changes the whole digest when any single input changes', () => {
    const base = computeOutcome(V.serverSeed, V.clientSeed, BigInt(V.nonce));

    // Compare full digests, never the roll: two different inputs can land on
    // the same 0..9999 bucket by chance, so asserting on the roll alone would
    // be a test that occasionally lies.
    const otherServerSeed = computeOutcome(
      '00'.repeat(31) + 'ff',
      V.clientSeed,
      BigInt(V.nonce),
    );
    const otherClientSeed = computeOutcome(V.serverSeed, 'client-seed-002', BigInt(V.nonce));
    const otherNonce = computeOutcome(V.serverSeed, V.clientSeed, BigInt(V.nonce) + 1n);

    expect(otherServerSeed.hmac).not.toBe(base.hmac);
    expect(otherClientSeed.hmac).not.toBe(base.hmac);
    expect(otherNonce.hmac).not.toBe(base.hmac);

    // And the three differ from each other, not just from the base.
    const digests = new Set([
      base.hmac,
      otherServerSeed.hmac,
      otherClientSeed.hmac,
      otherNonce.hmac,
    ]);
    expect(digests.size).toBe(4);
  });

  it('separates the client seed from the nonce unambiguously', () => {
    // "a:1" and "a:1" must be the only way to reach that message. If the
    // separator were dropped, ("ab", 1) and ("a", 11) would collide.
    expect(outcomeMessage('ab', 1n)).not.toBe(outcomeMessage('a', 11n));
    expect(computeOutcome(V.serverSeed, 'ab', 1n).hmac).not.toBe(
      computeOutcome(V.serverSeed, 'a', 11n).hmac,
    );
  });

  it('handles decimal conversion with integers only', () => {
    expect(parseHundredths('1.00')).toBe(100);
    expect(parseHundredths('98.00')).toBe(9800);
    expect(parseHundredths('59.63')).toBe(5963);
    expect(parseHundredths('60')).toBe(6000);
    expect(parseHundredths('60.5')).toBe(6050);

    expect(formatHundredths(0)).toBe('0.00');
    expect(formatHundredths(5963)).toBe('59.63');
    expect(formatHundredths(9999)).toBe('99.99');
    expect(formatHundredths(100)).toBe('1.00');
  });

  it('spans the full 0.00 to 99.99 range and never leaves it', () => {
    for (let n = 0; n < 500; n += 1) {
      const o = computeOutcome(V.serverSeed, 'range-probe', BigInt(n));
      expect(o.rollHundredths).toBeGreaterThanOrEqual(0);
      expect(o.rollHundredths).toBeLessThanOrEqual(9999);
      expect(o.roll).toBe(formatHundredths(o.rollHundredths));
    }
  });
});
