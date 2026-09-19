import { useState, type ReactNode } from 'react';
import { CheckCircleIcon, ChevronDownIcon, CopyIcon } from './icons.tsx';
import { accountLabel } from '../format.ts';

/**
 * Three tiers of card, so weight tracks importance rather than every panel
 * competing for the same attention:
 *   primary   — the wallet, the result, the verified finish
 *   secondary — trust cards, live proof, activity
 *   technical — raw journal, refusal table, seed history: deliberately quiet
 */
type Tier = 'primary' | 'secondary' | 'technical';

const TIER: Record<Tier, string> = {
  primary: 'border-line-strong bg-surface shadow-lift',
  secondary: 'border-line bg-surface shadow-card',
  technical: 'border-line bg-subtle',
};

export const Card = ({
  children,
  className = '',
  tier = 'secondary',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  tier?: Tier;
  as?: 'section' | 'div' | 'article';
}) => <Tag className={`rounded-xl border ${TIER[tier]} ${className}`}>{children}</Tag>;

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
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {eyebrow}
      </p>
    )}
    <h2 className="text-section font-semibold">{title}</h2>
    {lead && <p className="mt-2 max-w-2xl text-ink-2">{lead}</p>}
  </header>
);

type Tone = 'accent' | 'fairness' | 'pending' | 'refusal' | 'muted';

const DOT: Record<Tone, string> = {
  accent: 'bg-accent-vivid',
  fairness: 'bg-fairness-vivid',
  pending: 'bg-pending-vivid',
  refusal: 'bg-refusal-vivid',
  muted: 'bg-muted',
};

/** Status never rests on colour alone — every dot ships with its label. */
export const StatusDot = ({ tone, label }: { tone: Tone; label: string }) => (
  <span className="inline-flex items-center gap-2">
    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden="true" />
    <span>{label}</span>
  </span>
);

const BADGE: Record<Tone, string> = {
  accent: 'text-accent-text border-accent-border bg-accent-soft',
  fairness: 'text-fairness border-fairness-border bg-fairness-soft',
  pending: 'text-pending border-pending-border bg-pending-soft',
  refusal: 'text-refusal border-refusal-border bg-refusal-soft',
  muted: 'text-muted border-line bg-subtle',
};

export const Badge = ({
  tone = 'muted',
  icon = false,
  children,
}: {
  tone?: Tone;
  icon?: boolean;
  children: ReactNode;
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${BADGE[tone]}`}
  >
    {icon && <CheckCircleIcon className="h-3.5 w-3.5" />}
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
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3 text-base' }[
    size
  ];
  // Green fill marks the one action worth taking next -- nothing else.
  const variants = {
    primary: 'bg-accent text-on-accent hover:bg-accent-hover',
    secondary: 'border border-line-strong bg-surface text-ink hover:border-muted',
    ghost: 'text-ink-2 hover:text-ink',
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizes} ${variants} ${className}`}
    >
      {busy && <span className="h-3 w-3 animate-shimmer rounded-full bg-current" aria-hidden="true" />}
      {children}
    </button>
  );
};

export const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-shimmer rounded-md bg-line ${className}`} aria-hidden="true" />
);

export const Copy = ({ value, label }: { value: string; label: string }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      aria-label={`Copy ${label}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:text-ink"
    >
      <CopyIcon className="h-3 w-3" />
      {done ? 'Copied' : 'Copy'}
    </button>
  );
};

/**
 * A long value shown short by default. Hashes, seeds and round ids are proof,
 * not decoration — they stay reachable in one click, but they no longer set the
 * visual weight of the card they sit in.
 */
export const HashValue = ({
  value,
  label,
  tone = 'fairness',
  head = 8,
  tail = 6,
}: {
  value: string;
  label: string;
  tone?: 'fairness' | 'muted';
  head?: number;
  tail?: number;
}) => {
  const [full, setFull] = useState(false);
  const short = value.length <= head + tail ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
  const colour = tone === 'fairness' ? 'text-fairness' : 'text-muted';

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={`mono text-xs ${colour} ${full ? 'break-all' : ''}`}>
        {full ? value : short}
      </span>
      <Copy value={value} label={label} />
      <button
        type="button"
        onClick={() => setFull((v) => !v)}
        aria-expanded={full}
        className="shrink-0 rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:text-ink"
      >
        {full ? 'Hide' : 'View full'}
      </button>
    </span>
  );
};

/** Technical depth, folded away until someone asks for it. */
export const Disclosure = ({
  summary,
  children,
  className = '',
}: {
  summary: string;
  children: ReactNode;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink"
      >
        {summary}
        <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-2 text-xs leading-relaxed text-ink-2">{children}</div>}
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
  <div className="rounded-xl border border-refusal-border bg-refusal-soft px-4 py-4 text-sm">
    <p className="font-medium text-refusal">The API could not be reached.</p>
    <p className="mt-1 text-ink-2">
      {error.message}
      {base ? (
        <>
          {' · '}
          <span className="mono">{base}</span>
        </>
      ) : null}
    </p>
    <p className="mt-2 text-xs text-muted">
      Nothing here is cached or invented — with the API down there is nothing to show.
    </p>
  </div>
);

/**
 * One stage of a money movement, named the way a person would name it, with the
 * arithmetic still visible. Raw account ids stay available underneath.
 */
export const MoneyFlow = ({
  title,
  entryId,
  postings,
  format,
}: {
  title: string;
  entryId?: number;
  postings: { account: string; amountMinor: number }[];
  format: (v: number) => string;
}) => {
  const sum = postings.reduce((a, p) => a + p.amountMinor, 0);
  return (
    <div className="rounded-lg border border-line bg-subtle px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h4>
        {entryId !== undefined && <span className="mono text-xs text-muted">#{entryId}</span>}
      </div>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">{title} postings</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {postings.map((p, i) => (
            <tr key={`${p.account}-${i}`}>
              <td className="py-0.5" title={p.account}>
                {accountLabel(p.account)}
              </td>
              <td
                className={`mono py-0.5 text-right ${p.amountMinor < 0 ? 'text-refusal' : 'text-accent-text'}`}
              >
                {format(p.amountMinor)}
              </td>
            </tr>
          ))}
          {postings.length === 0 && (
            <tr>
              <td colSpan={2} className="py-0.5 text-muted">
                No postings — lifecycle marker
              </td>
            </tr>
          )}
          <tr className="border-t border-line">
            <td className="py-1 text-xs text-muted">Balances to</td>
            <td
              className={`mono py-1 text-right text-xs ${sum === 0 ? 'text-accent-text' : 'text-refusal'}`}
            >
              {format(sum)} {sum === 0 ? '✓' : '✗'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
