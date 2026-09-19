import { Skeleton, StatusDot } from './ui.tsx';
import { formatMinor } from '../format.ts';
import type { Me } from '../types.ts';

const LINKS = [
  { href: '#demo', label: 'Demo' },
  { href: '#activity', label: 'Activity' },
  { href: '#proofs', label: 'Proofs' },
  { href: '#how', label: 'How it works' },
];

export const TopNav = ({
  apiUp,
  apiLoading,
  me,
}: {
  apiUp: boolean;
  apiLoading: boolean;
  me: Me | null;
}) => (
  <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
    <div className="mx-auto flex max-w-console flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
      <a href="#top" className="flex items-baseline gap-2">
        <span className="text-lg font-semibold tracking-tight">ledgerproof</span>
        <span className="hidden text-xs text-muted lg:inline">proof-driven settlement</span>
      </a>

      <nav aria-label="Sections" className="order-3 w-full sm:order-none sm:w-auto">
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a className="hover:text-ink" href={l.href}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="ml-auto flex items-center gap-3 sm:gap-5">
        <span className="text-xs">
          {apiLoading ? (
            <StatusDot tone="pending" label="Checking API" />
          ) : apiUp ? (
            <StatusDot tone="accent" label="API online" />
          ) : (
            <span className="text-refusal">
              <StatusDot tone="refusal" label="API offline" />
            </span>
          )}
        </span>

        <div className="rounded-lg border border-line bg-raised px-3 py-1.5 text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted">Demo balance</p>
          {me ? (
            <p className="num text-base font-semibold leading-tight">
              {formatMinor(me.balanceMinor)}
            </p>
          ) : (
            <Skeleton className="mt-1 h-4 w-16" />
          )}
        </div>

        <span className="mono hidden text-xs text-muted lg:inline">{me?.userId ?? '—'}</span>
      </div>
    </div>
  </header>
);
