import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, MonitorIcon, MoonIcon, SunIcon } from './icons.tsx';
import { THEMES, type Theme } from '../theme.ts';

const ICON = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
} as const;

/** Compact menu in the header; the same options stack inside the mobile menu. */
export const ThemeToggle = ({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const Current = ICON[theme];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${theme}`}
        className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-muted hover:text-ink"
      >
        <Current className="h-4 w-4" />
        <ChevronDownIcon className="h-3 w-3" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1.5 w-36 overflow-hidden rounded-lg border border-line bg-surface shadow-lift"
        >
          {THEMES.map((t) => {
            const Icon = ICON[t.value];
            return (
              <button
                key={t.value}
                role="menuitemradio"
                aria-checked={theme === t.value}
                type="button"
                onClick={() => {
                  setTheme(t.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-subtle ${
                  theme === t.value ? 'text-accent-text' : 'text-ink'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {theme === t.value && <span className="ml-auto text-xs">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** The same choice, rendered as a row of buttons for the mobile menu. */
export const ThemeRow = ({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) => (
  <div>
    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Theme</p>
    <div className="flex gap-2">
      {THEMES.map((t) => {
        const Icon = ICON[t.value];
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => setTheme(t.value)}
            aria-pressed={theme === t.value}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm ${
              theme === t.value
                ? 'border-accent-border bg-accent-soft text-accent-text'
                : 'border-line text-ink-2'
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </button>
        );
      })}
    </div>
  </div>
);
