/**
 * Money is bigint in the API and a JSON number on the wire. All amounts are
 * minor units (cents) and stay far below Number.MAX_SAFE_INTEGER, so the
 * conversion is lossless for every value this system can produce.
 */
export const jsonSafe = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (typeof v === 'bigint') {
        if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < -BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error(`bigint ${v} exceeds safe JSON range`);
        }
        return Number(v);
      }
      return v;
    }),
  ) as T;
