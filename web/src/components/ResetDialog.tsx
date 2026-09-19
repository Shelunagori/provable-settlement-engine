import { useEffect, useRef } from 'react';
import { Button } from './ui.tsx';

/**
 * A reset destroys server-side state, so it asks first and says plainly what
 * goes. Confirmation is the default action for neither button -- Escape and the
 * backdrop both cancel.
 */
export const ResetDialog = ({
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const cancelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.querySelector('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        className="relative w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-lift"
      >
        <h2 id="reset-title" className="text-lg font-semibold">
          Reset demo?
        </h2>
        <p className="mt-2 text-sm text-ink-2">
          This will remove the current demo balance, bets and activity and return the demo to its
          starting state.
        </p>
        <div ref={cancelRef} className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} busy={busy}>
            Reset demo
          </Button>
        </div>
      </div>
    </div>
  );
};
