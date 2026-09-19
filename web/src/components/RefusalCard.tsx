import { formatMinor } from '../format.ts';
import { ShieldCheckIcon } from './icons.tsx';

const SKIP = new Set(['refused', 'code', 'message']);

/** Field names as a person would read them; unknown keys fall back to the key. */
const FIELD_LABEL: Record<string, string> = {
  limit: 'Maximum',
  min: 'Minimum',
  max: 'Maximum',
  requestedAmount: 'Requested',
  balanceMinor: 'Balance',
  netLossToday: 'Lost today',
  targetUnder: 'Target',
  betId: 'Request ID',
  seedHash: 'Commitment',
};

const label = (key: string) =>
  FIELD_LABEL[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const renderValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (
    typeof value === 'number' &&
    /minor$|^limit$|^min$|^max$|^requestedAmount$|^netLossToday$|^balanceMinor$/i.test(key)
  ) {
    return formatMinor(value);
  }
  return String(value);
};

/**
 * A refusal is a decision, not a stack trace. The sentence a person needs comes
 * first; the code and HTTP status stay visible underneath for anyone who wants
 * to look it up in the refusal table.
 */
export const RefusalCard = ({
  status,
  body,
}: {
  status: number;
  body: Record<string, unknown>;
}) => {
  const details = Object.entries(body).filter(([k]) => !SKIP.has(k));

  return (
    <div className="rounded-xl border border-refusal-border border-l-4 border-l-refusal bg-refusal-soft px-4 py-3.5">
      <div className="flex items-center gap-2">
        <ShieldCheckIcon className="h-4 w-4 shrink-0 text-refusal" />
        <p className="text-sm font-semibold text-refusal">Request refused</p>
      </div>
      <p className="mt-1.5 text-base text-ink">{String(body.message ?? '')}</p>

      {details.length > 0 && (
        <dl className="mt-3 grid max-w-sm gap-x-6 gap-y-1 text-sm">
          {details.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-6">
              <dt className="text-ink-2">{label(k)}</dt>
              <dd className="mono min-w-0 break-all text-right">{renderValue(k, v)}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mono mt-3 text-xs text-muted">
        {String(body.code)} · HTTP {status}
      </p>
    </div>
  );
};
