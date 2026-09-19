import type { ReactNode } from 'react';

/**
 * A vertical chain of steps. It stays vertical at every width because the
 * reading order is the point, and the connector is a border rather than a
 * character so it never lands in the text layer.
 */
export const Flow = ({
  steps,
  tone = 'accent',
}: {
  steps: { title: string; body?: ReactNode; note?: string }[];
  tone?: 'accent' | 'fairness';
}) => {
  const dot = tone === 'accent' ? 'bg-accent-vivid' : 'bg-fairness-vivid';
  return (
    <ol className="relative ml-1.5 border-l border-line pl-6">
      {steps.map((s, i) => (
        <li key={s.title} className={i === steps.length - 1 ? '' : 'pb-5'}>
          <span
            className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${dot}`}
            aria-hidden="true"
          />
          <p className="text-sm font-semibold">{s.title}</p>
          {s.body && <p className="mt-0.5 text-sm text-ink-2">{s.body}</p>}
          {s.note && <p className="mono mt-1 text-[11px] text-muted">{s.note}</p>}
        </li>
      ))}
    </ol>
  );
};
