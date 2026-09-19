/**
 * The whole mechanic in one picture: the band you win in, where your target
 * sits, and where the roll landed.
 *
 * Numbers alone leave "roll under 50.00" as something to work out. The same
 * information is in the text below it and in the label, so nothing here is
 * carried by the drawing alone.
 */
export const RangeMeter = ({
  target,
  result,
  won,
}: {
  target: number;
  result?: number;
  won?: boolean;
}) => {
  const pct = (v: number) => Math.min(100, Math.max(0, (v / 99.99) * 100));

  return (
    <figure className="mt-1">
      <figcaption className="sr-only">
        Results run from 0.00 to 99.99. You win below {target.toFixed(2)}.
        {result !== undefined && ` This result was ${result.toFixed(2)}, a ${won ? 'win' : 'loss'}.`}
      </figcaption>

      <div className="relative h-8" aria-hidden="true">
        <div className="absolute inset-x-0 top-3 h-2 overflow-hidden rounded-full bg-line">
          {/* Solid token rather than an alpha modifier: the themed colours are
              bare CSS variables, so `bg-accent-vivid/45` resolves to nothing and
              the winning band would silently disappear. */}
          <div
            className="h-full rounded-l-full bg-accent-vivid"
            style={{ width: `${pct(target)}%` }}
          />
        </div>

        <div className="absolute top-0 -translate-x-1/2" style={{ left: `${pct(target)}%` }}>
          <div className="h-8 w-px bg-ink-2" />
        </div>

        {result !== undefined && (
          <div
            className="absolute top-1 -translate-x-1/2 animate-rise"
            style={{ left: `${pct(result)}%` }}
          >
            <span
              className={`block h-6 w-6 rounded-full border-2 border-surface ${
                won ? 'bg-accent' : 'bg-refusal'
              }`}
            />
          </div>
        )}
      </div>

      <div className="flex justify-between text-[11px] text-muted">
        <span className="mono">0.00</span>
        <span>
          win below <span className="mono text-ink-2">{target.toFixed(2)}</span>
        </span>
        <span className="mono">99.99</span>
      </div>
    </figure>
  );
};
