import type { ReactNode } from 'react';

export const Panel = ({
  label,
  description,
  children,
  actions,
}: {
  label: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}) => (
  <section className="rounded-lg border border-line bg-surface">
    <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {label}
        </h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      {actions}
    </header>
    <div className="px-4 py-4 text-sm">{children}</div>
  </section>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="py-6 text-center text-sm text-muted">{children}</p>
);

export const Loading = ({ what }: { what: string }) => (
  <p className="py-6 text-center text-sm text-muted" aria-live="polite">
    Loading {what}…
  </p>
);

export const ErrorState = ({ error, base }: { error: Error; base?: string }) => (
  <div className="rounded border border-refusal/40 px-3 py-3 text-sm">
    <p className="font-medium text-refusal">Could not reach the API.</p>
    <p className="mt-1 text-muted">
      {error.message}
      {base ? (
        <>
          {' · '}
          <span className="num">{base}</span>
        </>
      ) : null}
    </p>
  </div>
);

export const Copy = ({ value, label }: { value: string; label: string }) => {
  const copy = () => {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted hover:text-ink"
    >
      copy
    </button>
  );
};
