import { useEffect } from 'react';

export type ToastMessage = { id: number; text: string };

export const Toasts = ({
  toasts,
  dismiss,
}: {
  toasts: ToastMessage[];
  dismiss: (id: number) => void;
}) => (
  <div
    className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end"
    aria-live="polite"
    aria-atomic="false"
  >
    {toasts.map((t) => (
      <Toast key={t.id} toast={t} dismiss={dismiss} />
    ))}
  </div>
);

const Toast = ({ toast, dismiss }: { toast: ToastMessage; dismiss: (id: number) => void }) => {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), 6000);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);

  return (
    <div className="pointer-events-auto flex max-w-[min(32rem,100%)] items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-lift">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-vivid" aria-hidden="true" />
      <span className="text-xs">{toast.text}</span>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
        className="ml-auto text-muted hover:text-ink"
      >
        ×
      </button>
    </div>
  );
};
