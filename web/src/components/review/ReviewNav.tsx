import { useEffect, useState } from 'react';
import { Button } from '../ui.tsx';
import { ThemeRow, ThemeToggle } from '../ThemeToggle.tsx';
import { CloseIcon, MenuIcon } from '../icons.tsx';
import { navigate } from '../../routing.ts';
import type { Theme } from '../../theme.ts';

const SECTIONS = [
  { href: '#overview', label: 'Overview' },
  { href: '#user-flow', label: 'User flow' },
  { href: '#ledger', label: 'Ledger' },
  { href: '#fairness', label: 'Fairness' },
  { href: '#architecture', label: 'Architecture' },
  { href: '#testing', label: 'Testing' },
  { href: '#production', label: 'Production' },
];

export const ReviewNav = ({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
}) => {
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-console items-center gap-4 px-4 py-3 sm:px-6">
        <a href="#top" className="text-lg font-semibold tracking-tight">
          ledgerproof
        </a>

        <nav aria-label="Review sections" className="hidden xl:block">
          <ul className="flex gap-4 text-sm text-ink-2">
            {SECTIONS.map((s) => (
              <li key={s.href}>
                <a className="hover:text-ink" href={s.href}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Button variant="primary" size="sm" onClick={() => navigate('/')}>
            Open live demo
          </Button>
          <span className="hidden xl:inline">
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </span>
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-expanded={menu}
            aria-label="Open menu"
            className="rounded-lg border border-line p-2 text-ink-2 hover:text-ink xl:hidden"
          >
            <MenuIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenu(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-x-0 top-0 max-h-[90vh] overflow-y-auto rounded-b-2xl border-b border-line bg-surface p-5 shadow-lift"
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
              {SECTIONS.map((s) => (
                <li key={s.href}>
                  <a
                    href={s.href}
                    onClick={() => setMenu(false)}
                    className="block rounded-lg px-2 py-2 hover:bg-subtle"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-5 border-t border-line pt-5">
              <ThemeRow theme={theme} setTheme={setTheme} />
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
