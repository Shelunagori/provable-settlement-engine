/**
 * Independent browser-side verification of a settled outcome.
 *
 * This is the one piece of domain logic that belongs in the console, and it
 * exists precisely because it must NOT trust the server. It does not import the
 * API's implementation and it does not call GET /fairness/verify: a check that
 * asks the party being checked for the answer proves nothing. Everything here
 * is computed locally with Web Crypto.
 *
 * The encoding contract is H3's, and the distinction it turns on is easy to get
 * wrong: the server seed is 64 lowercase hex characters, and it is the UTF-8
 * bytes of that TEXT which are hashed and used as the HMAC key -- never the 32
 * bytes the hex encodes. Both readings are defensible; they produce completely
 * different digests. Picking the wrong one here would tell users the service is
 * cheating when it is not.
 *
 * The shared fixture in fixtures/fairness-vectors.json pins the contract, and
 * this module's test consumes that same file rather than a copy of its values.
 */
const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const sha256Text = async (text: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));

export const hmacSha256Hex = async (keyText: string, messageText: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyText),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(messageText)));
};

export type BrowserOutcome = {
  hmac: string;
  first8: string;
  integer: number;
  /** 0..9999. Comparisons happen here, never on the decimal rendering. */
  rollHundredths: number;
  roll: string;
};

/** Exact decimal for a value in hundredths. No floating point. */
export const formatHundredths = (hundredths: number): string => {
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  return `${whole}.${String(frac).padStart(2, '0')}`;
};

/** Parses "59.63" into 5963, so a server-reported roll can be compared exactly. */
export const parseHundredths = (text: string | number): number => {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(String(text).trim());
  if (!m) throw new Error(`Not an exact decimal: ${text}`);
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
};

export const computeBrowserOutcome = async (
  serverSeed: string,
  clientSeed: string,
  nonce: number | string | bigint,
): Promise<BrowserOutcome> => {
  const hmac = await hmacSha256Hex(serverSeed, `${clientSeed}:${nonce}`);
  const first8 = hmac.slice(0, 8);
  const integer = Number.parseInt(first8, 16);
  const rollHundredths = integer % 10000;
  return { hmac, first8, integer, rollHundredths, roll: formatHundredths(rollHundredths) };
};

/** Does this disclosed seed hash to the commitment published before it was used? */
export const verifyCommitment = async (
  serverSeed: string,
  expectedHash: string,
): Promise<boolean> => (await sha256Text(serverSeed)) === expectedHash;
