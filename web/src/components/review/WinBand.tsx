/**
 * The win band, shown once with both a winning and a losing result on it, so
 * "roll under" is understood from the picture rather than from the phrase. The
 * caption carries the same information for anyone not seeing the drawing.
 */
export const WinBand = ({ target = 50 }: { target?: number }) => {
  const pct = (v: number) => Math.min(100, Math.max(0, (v / 99.99) * 100));

  return (
    <figure>
      <figcaption className="sr-only">
        Results run from 0.00 to 99.99. Anything below {target.toFixed(2)} wins; {target.toFixed(2)}{' '}
        and above loses.
      </figcaption>

      <div className="flex h-7 overflow-hidden rounded-lg border border-line" aria-hidden="true">
        <div
          className="flex items-center justify-center bg-accent-soft text-[11px] font-semibold text-accent-text"
          style={{ width: `${pct(target)}%` }}
        >
          WIN
        </div>
        <div className="flex flex-1 items-center justify-center bg-refusal-soft text-[11px] font-semibold text-refusal">
          LOSE
        </div>
      </div>

      <div className="mt-1 flex justify-between text-[11px] text-muted" aria-hidden="true">
        <span className="mono">0.00</span>
        <span className="mono text-ink-2">{target.toFixed(2)}</span>
        <span className="mono">99.99</span>
      </div>
    </figure>
  );
};
