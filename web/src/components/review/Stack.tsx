import { ArrowRightIcon } from '../icons.tsx';

/**
 * The deployment stack, drawn as three boxes and two labelled hops. Hand-built
 * from layout primitives rather than a diagram library: three nodes do not
 * justify a dependency, and this version reflows on a phone and recolours with
 * the theme for free.
 */
export const Stack = ({
  tiers,
}: {
  tiers: { platform: string; title: string; items: string[]; role: string }[];
}) => (
  <div>
    {tiers.map((t, i) => (
      <div key={t.title}>
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t.platform}
              </p>
              <p className="mt-0.5 text-base font-semibold">{t.title}</p>
            </div>
            <p className="text-xs text-ink-2">{t.role}</p>
          </div>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {t.items.map((item) => (
              <li
                key={item}
                className="rounded-md border border-line bg-subtle px-2 py-1 text-xs text-ink-2"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        {i < tiers.length - 1 && (
          <div className="flex items-center justify-center gap-2 py-2.5 text-xs text-muted">
            <span className="h-4 w-px bg-line" aria-hidden="true" />
            <ArrowRightIcon className="h-3.5 w-3.5 rotate-90" />
            <span>{i === 0 ? 'HTTPS, signed session cookie' : 'SQL transactions'}</span>
          </div>
        )}
      </div>
    ))}
  </div>
);
