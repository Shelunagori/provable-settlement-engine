import { createHash, createHmac } from 'node:crypto';

/**
 * The cryptographic representation is fixed here and nowhere else.
 *
 * A server seed is 32 random bytes rendered as 64 lowercase hex characters,
 * and it is the TEXT of those 64 characters that gets hashed and used as the
 * HMAC key -- never the 32 bytes it encodes. The distinction is invisible in
 * any single runtime and fatal across two: hashing the decoded bytes on the
 * server while the browser hashes the string produces two different digests
 * for the same seed, and a verifier that disagrees with the server is worse
 * than no verifier at all.
 */
export type Outcome = {
  /** Full HMAC-SHA256 digest, lowercase hex. */
  hmac: string;
  /** The first 8 hex characters, which select the roll. */
  first8: string;
  /** Those 8 characters as an unsigned integer. */
  integer: number;
  /** 0..9999. The roll in hundredths, kept as an integer. */
  rollHundredths: number;
  /** Exact decimal rendering of rollHundredths, e.g. "59.63". */
  roll: string;
};

export const SERVER_SEED_PATTERN = /^[0-9a-f]{64}$/;

/** SHA256 over the UTF-8 text of the seed. This is the published commitment. */
export const seedHashOf = (serverSeed: string): string =>
  createHash('sha256').update(Buffer.from(serverSeed, 'utf8')).digest('hex');

/**
 * The colon is load-bearing: without a separator, ("ab", 1) and ("a", 11)
 * would produce the same message and therefore the same outcome.
 */
export const outcomeMessage = (clientSeed: string, nonce: bigint): string =>
  `${clientSeed}:${nonce}`;

/** Exact decimal string for a value in hundredths. No floating point. */
export const formatHundredths = (hundredths: number): string => {
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  return `${whole}.${String(frac).padStart(2, '0')}`;
};

/**
 * Parses an exact decimal with at most two places into integer hundredths.
 *
 * Parsing to a float and multiplying by 100 would be enough to move a boundary
 * case across the comparison: 59.63 is not representable in binary, and
 * `59.63 * 100` is 5962.999999999999.
 */
export const parseHundredths = (text: string): number => {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) throw new Error(`Not an exact decimal with at most two places: ${text}`);
  const whole = Number(m[1]);
  const frac = (m[2] ?? '').padEnd(2, '0');
  return whole * 100 + Number(frac);
};

/**
 * The outcome of one roll. Pure: it touches no database, allocates no nonce
 * and mutates nothing. Anyone with the three inputs gets this result.
 */
export const computeOutcome = (
  serverSeed: string,
  clientSeed: string,
  nonce: bigint,
): Outcome => {
  const hmac = createHmac('sha256', Buffer.from(serverSeed, 'utf8'))
    .update(Buffer.from(outcomeMessage(clientSeed, nonce), 'utf8'))
    .digest('hex');

  const first8 = hmac.slice(0, 8);
  const integer = Number.parseInt(first8, 16);
  const rollHundredths = integer % 10000;

  return { hmac, first8, integer, rollHundredths, roll: formatHundredths(rollHundredths) };
};

/**
 * Strictly less than. A roll landing exactly on the target is a loss, and the
 * comparison is between integers so no rounding can move it either way.
 */
export const isWin = (rollHundredths: number, targetUnderHundredths: number): boolean =>
  rollHundredths < targetUnderHundredths;
