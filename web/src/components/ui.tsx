import type { ReactNode } from 'react';

export const Card = ({
  children,
  className = '',
  raised = false,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  raised?: boolean;
  as?: 'section' | 'div' | 'article';
}) => (
  <Tag
    className={`rounded-xl border border-line ${raised ? 'bg-raised' : 'bg-surface'} shadow-card ${className}`}
  >
    {children}
  </Tag>
);

export const SectionHeading = ({
  eyebrow,
  title,
  lead,
  id,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  id?: string;
}) => (
  <header className="mb-5" id={id}>
    {eyebrow && (
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</p>
    )}
    <h2 className="text-section font-semibold">{title}</h2>
    {lead && <p className="mt-2 max-w-2xl text-muted">{lead}</p>}
  </header>
);

type Tone = 'accent' | 'fairness' | 'pending' | 'refusal' | 'muted';

const DOT: Record<Tone, string> = {
  accent: 'bg-accent',
  fairness: 'bg-fairness',
  pending: 'bg-pending',
  refusal: 'bg-refusal',
  muted: 'bg-muted',
};

/** Status never rests on colour alone — every dot ships with its label. */
export const StatusDot = ({ tone, label }: { tone: Tone; label: string }) => (
  <span className="inline-flex items-center gap-2">
    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden="true" />
    <span>{label}</span>
  </span>
);

const TEXT: Record<Tone, string> = {
  accent: 'text-accent border-accent/30 bg-accent/10',
  fairness: 'text-fairness border-fairness/30 bg-fairness/10',
  pending: 'text-pending border-pending/30 bg-pending/10',
  refusal: 'text-refusal border-refusal/30 bg-refusal/10',
  muted: 'text-muted border-line bg-transparent',
};

export const Badge = ({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) => (
  <span
    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TEXT[tone]}`}
  >
    {children}
  </span>
);

export const Button = ({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  busy = false,
  disabled = false,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  busy?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) => {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
  }[size];
  const variants = {
    primary: 'bg-accent text-on-accent hover:brightness-110',
    secondary: 'border border-line bg-raised text-ink hover:border-muted',
    ghost: 'text-muted hover:text-ink',
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`${base} ${sizes} ${variants} ${className}`}
    >
      {busy && (
        <span
          className="h-3 w-3 animate-shimmer rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
};

export const Skeleton = ({ className = '' }: { className?: string }) => (
  <div
    className={`animate-shimmer rounded-md bg-line ${className}`}
    aria-hidden="true"
  />
);

export const Copy = ({ value, label }: { value: string; label: string }) => (
  <button
    type="button"
    onClick={() => void navigator.clipboard?.writeText(value).catch(() => undefined)}
    aria-label={`Copy ${label}`}
    className="rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:text-ink"
  >
    Copy
  </button>
);

/** A ledger movement, rendered so the arithmetic is visible at a glance. */
export const PostingRows = ({
  postings,
  format,
}: {
  postings: { account: string; amountMinor: number }[];
  format: (v: number) => string;
}) => {
  const sum = postings.reduce((a, p) => a + p.amountMinor, 0);
  return (
    <div className="rounded-lg border border-line bg-bg/50 p-3">
      <table className="w-full text-sm">
        <caption className="sr-only">Ledger postings</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {postings.map((p, i) => (
            <tr key={`${p.account}-${i}`}>
              <td className="mono py-0.5 text-muted">{p.account}</td>
              <td
                className={`mono py-0.5 text-right ${p.amountMinor < 0 ? 'text-refusal' : 'text-accent'}`}
              >
                {format(p.amountMinor)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-line">
            <td className="py-1 text-xs text-muted">Sum</td>
            <td
              className={`mono py-1 text-right text-xs ${sum === 0 ? 'text-accent' : 'text-refusal'}`}
            >
              {format(sum)} {sum === 0 ? '✓' : '✗'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="py-6 text-center text-sm text-muted">{children}</p>
);

export const Loading = ({ what }: { what: string }) => (
  <p className="py-6 text-center text-sm text-muted" aria-live="polite">
    Loading {what}…
  </p>
);

export const ErrorState = ({ error, base }: { error: Error; base?: string }) => (
  <div className="rounded-lg border border-refusal/40 bg-refusal/5 px-4 py-4 text-sm">
    <p className="font-medium text-refusal">The API could not be reached.</p>
    <p className="mt-1 text-muted">
      {error.message}
      {base ? (
        <>
          {' · '}
          <span className="mono">{base}</span>
        </>
      ) : null}
    </p>
    <p className="mt-2 text-xs text-muted">
      Nothing on this page is cached or invented — with the API down there is nothing to show.
    </p>
  </div>
);
