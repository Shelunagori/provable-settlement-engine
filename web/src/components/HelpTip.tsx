import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A small "?" that explains one idea. Click rather than hover, so it works the
 * same on a phone, and the content is real markup rather than a title attribute
 * so it can hold an example.
 */
export const HelpTip = ({ label, children }: { label: string; children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-line-strong text-[10px] font-semibold text-muted hover:text-ink"
      >
        ?
      </button>
      {open && (
        <span
          role="note"
          className="absolute left-0 top-6 z-30 w-64 rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed text-ink-2 shadow-lift"
        >
          {children}
        </span>
      )}
    </span>
  );
};
