import { CheckCircleIcon } from './icons.tsx';

export const STEPS = [
  'Add funds',
  'Run outcome',
  'Review settlement',
  'Reveal commitment',
  'Verify in browser',
];

/**
 * Where you are, in one glance. A thin track rather than a scoreboard: the
 * point is orientation, not reward.
 */
export const DemoProgress = ({ current }: { current: number }) => (
  <nav aria-label="Demo progress" className="mb-8">
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
      Demo progress
    </p>
    <ol className="flex flex-wrap gap-x-2 gap-y-3 sm:flex-nowrap">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 basis-[calc(50%-0.5rem)] flex-col gap-1.5 sm:basis-0">
            <span
              className={`h-1 rounded-full ${
                done ? 'bg-accent-vivid' : active ? 'bg-accent' : 'bg-line'
              }`}
              aria-hidden="true"
            />
            <span
              className={`flex items-center gap-1.5 text-xs ${
                done || active ? 'text-ink' : 'text-muted'
              }`}
            >
              {done ? (
                <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-accent-text" />
              ) : (
                <span className="mono shrink-0 text-[11px]">{String(n).padStart(2, '0')}</span>
              )}
              <span className="truncate">{label}</span>
              {active && <span className="sr-only">(current step)</span>}
              {done && <span className="sr-only">(completed)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  </nav>
);
