import { describe, expect, it } from 'vitest';
import vectors from '../../../fixtures/fairness-vectors.json';
import {
  computeBrowserOutcome,
  hmacSha256Hex,
  parseHundredths,
  sha256Text,
  verifyCommitment,
} from './verify.js';

/**
 * The browser verifier is checked against the same fixture file the API tests
 * use. A copy of the numbers here would let the two implementations drift apart
 * quietly, which is the one failure mode this whole mechanism exists to prevent.
 */
const V = vectors.vectors[0]!;

describe('browser fairness verifier', () => {
  it('reproduces the shared fixed vector with Web Crypto alone', async () => {
    const outcome = await computeBrowserOutcome(V.serverSeed, V.clientSeed, V.nonce);
    expect(outcome.hmac).toBe(V.hmac);
    expect(outcome.first8).toBe(V.first8);
    expect(outcome.integer).toBe(V.integer);
    expect(outcome.rollHundredths).toBe(V.rollHundredths);
    expect(outcome.roll).toBe(V.roll);
  });

  it('recomputes the published commitment', async () => {
    expect(await sha256Text(V.serverSeed)).toBe(V.serverSeedHash);
    expect(await verifyCommitment(V.serverSeed, V.serverSeedHash)).toBe(true);
    expect(await verifyCommitment(V.serverSeed, 'f'.repeat(64))).toBe(false);
  });

  it('keys the HMAC with the seed text, not the bytes it encodes', async () => {
    // Hex-decoding the seed first is the plausible wrong reading. It must not
    // produce the fixture's digest -- if it did, the contract would be ambiguous
    // and a verifier could disagree with the server while looking correct.
    const decoded = Uint8Array.from(
      V.serverSeed.match(/../g)!.map((b) => Number.parseInt(b, 16)),
    );
    const decodedAsText = new TextDecoder('latin1').decode(decoded);
    const wrong = await hmacSha256Hex(decodedAsText, V.message);
    expect(wrong).not.toBe(V.hmac);
  });

  it('detects a server roll that differs by a single hundredth', () => {
    const served = parseHundredths(V.roll);
    expect(served).toBe(V.rollHundredths);
    // Comparison is on integers, so an off-by-one-hundredth is caught rather
    // than rounded away.
    expect(served).not.toBe(V.rollHundredths + 1);
    expect(parseHundredths('59.62')).not.toBe(V.rollHundredths);
  });

  it('separates client seed from nonce', async () => {
    const a = await computeBrowserOutcome(V.serverSeed, 'ab', 1);
    const b = await computeBrowserOutcome(V.serverSeed, 'a', 11);
    expect(a.hmac).not.toBe(b.hmac);
  });
});
