import { useEffect, useRef, type ReactNode } from 'react';

export const Drawer = ({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[80vh] w-full max-w-lg overflow-auto rounded-t-lg border border-line bg-surface p-5 shadow-lift sm:rounded-lg"
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="text-sm font-medium">{title}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:text-ink"
          >
            close
          </button>
        </div>
        <div className="space-y-2 text-sm text-ink-2">{children}</div>
      </div>
    </div>
  );
};
