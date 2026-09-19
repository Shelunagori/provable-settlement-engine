import { useEffect, useState } from 'react';
import { Skeleton, StatusDot } from './ui.tsx';
import { ThemeRow, ThemeToggle } from './ThemeToggle.tsx';
import { CloseIcon, MenuIcon } from './icons.tsx';
import { formatMinor } from '../format.ts';
import type { Theme } from '../theme.ts';
import type { Me } from '../types.ts';

const LINKS = [
  { href: '#demo', label: 'Demo' },
  { href: '#activity', label: 'Activity' },
  { href: '#proofs', label: 'Proofs' },
  { href: '#how', label: 'How it works' },
];

const Balance = ({ me, compact = false }: { me: Me | null; compact?: boolean }) => (
  <div
    className={`rounded-lg border border-line bg-surface px-3 py-1.5 text-right ${compact ? '' : 'min-w-[7rem]'}`}
  >
    {me ? (
      <p className="num text-base font-semibold leading-tight">{formatMinor(me.balanceMinor)}</p>
    ) : (
      <Skeleton className="ml-auto h-4 w-16" />
    )}
    <p className="text-[10px] uppercase tracking-wider text-muted">Demo credits</p>
  </div>
);

export const TopNav = ({
  apiUp,
  apiLoading,
  me,
  theme,
  setTheme,
}: {
  apiUp: boolean;
  apiLoading: boolean;
  me: Me | null;
  theme: Theme;
  setTheme: (t: Theme) => void;
}) => {
  const [menu, setMenu] = useState(false);

  // A menu that survives a rotation into desktop width would be a trap.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  const status = apiLoading ? (
    <StatusDot tone="pending" label="Checking" />
  ) : apiUp ? (
    <StatusDot tone="accent" label="API online" />
  ) : (
    <span className="text-refusal">
      <StatusDot tone="refusal" label="API offline" />
    </span>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-console items-center gap-4 px-4 py-3 sm:px-6">
        <a href="#top" className="text-lg font-semibold tracking-tight">
          ledgerproof
        </a>

        {/* Links collapse well before the tablet breakpoint so 768px never
            renders a squeezed desktop header. */}
        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="flex gap-5 text-sm text-ink-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a className="hover:text-ink" href={l.href}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden text-xs sm:inline">{status}</span>
          <Balance me={me} />
          <span className="hidden lg:inline">
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </span>
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-expanded={menu}
            aria-label="Open menu"
            className="rounded-lg border border-line p-2 text-ink-2 hover:text-ink lg:hidden"
          >
            <MenuIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenu(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-x-0 top-0 rounded-b-2xl border-b border-line bg-surface p-5 shadow-lift"
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold tracking-tight">ledgerproof</span>
              <button
                type="button"
                onClick={() => setMenu(false)}
                aria-label="Close menu"
                className="rounded-lg border border-line p-2 text-ink-2 hover:text-ink"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <ul className="mt-5 space-y-1 text-base">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setMenu(false)}
                    className="block rounded-lg px-2 py-2 hover:bg-subtle"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-5 border-t border-line pt-5">
              <ThemeRow theme={theme} setTheme={setTheme} />
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-xs text-muted">
              <span>{status}</span>
              <span className="mono">{me?.userId ?? '—'}</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
