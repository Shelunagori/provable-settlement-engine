/**
 * Money arrives as integer minor units and every decision about it has already
 * been made on the server. These helpers are for display only: nothing here
 * feeds back into a request.
 */
export const formatMinor = (value: number | bigint): string => {
  const n = BigInt(value);
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${negative ? '-' : ''}${whole.toLocaleString('en-US')}.${String(frac).padStart(2, '0')}`;
};

export const formatSignedMinor = (value: number | bigint): string => {
  const n = BigInt(value);
  return n > 0n ? `+${formatMinor(n)}` : formatMinor(n);
};

/** First and last characters of a hash, for dense display. Full value stays copyable. */
export const shortHash = (hash: string, head = 6, tail = 4): string =>
  hash.length <= head + tail ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`;

export const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toISOString().slice(11, 19);
};

/** Informational only. The server decides the payout. */
export const multiplierFor = (targetUnder: number): string =>
  targetUnder <= 0 ? '—' : (99 / targetUnder).toFixed(4);
