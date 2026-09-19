import { formatMinor } from '../format.ts';

const SKIP = new Set(['refused', 'code', 'message']);

const renderValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (
    typeof value === 'number' &&
    /minor$|^limit$|^requestedAmount$|^netLossToday$|^balanceMinor$/i.test(key)
  ) {
    return `${formatMinor(value)} (${value})`;
  }
  return String(value);
};

/**
 * A refusal rendered as what it is: a decision with a code, not an error blob.
 * Details are laid out as rows rather than stringified, and unknown keys are
 * still shown, so a refusal this component has never seen is still readable.
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
    <div className="border-l-2 border-refusal bg-bg/40 py-2 pl-3 pr-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="num text-xs font-medium text-refusal">{String(body.code)}</span>
        <span className="num text-[10px] text-muted">HTTP {status}</span>
      </div>
      <p className="mt-1 text-sm">{String(body.message ?? '')}</p>
      {details.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {details.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="num text-[11px] text-muted">{k}</dt>
              <dd className="num break-all text-[11px]">{renderValue(k, v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};
