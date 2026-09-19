import { Card } from './ui.tsx';
import { CopyIcon, FingerprintIcon, ScalesIcon, ShieldCheckIcon } from './icons.tsx';

/**
 * Human sentence first, technical shorthand second. The terminology is still
 * here -- it is simply no longer what a first-time visitor has to decode.
 */
const TRUST = [
  {
    icon: ScalesIcon,
    title: 'Ledger balanced',
    body: 'Every transaction balances to zero.',
    detail: 'Σ postings = 0',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Balance protected',
    body: 'Your balance cannot be edited directly.',
    detail: 'Calculated from ledger postings',
  },
  {
    icon: CopyIcon,
    title: 'Duplicate-safe',
    body: 'Repeated payment notifications move money once.',
    detail: 'Idempotent by event ID',
  },
  {
    icon: FingerprintIcon,
    title: 'Outcome verifiable',
    body: 'The server commits before the result exists.',
    detail: 'Verify in your browser',
  },
];

export const TrustCards = () => (
  <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {TRUST.map(({ icon: Icon, ...t }) => (
      <li key={t.title}>
        <Card as="div" className="h-full p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
              <Icon className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold">
              {t.title} <span className="text-accent-text">✓</span>
            </h3>
          </div>
          <p className="mt-2 text-sm leading-snug text-ink-2">{t.body}</p>
          <p className="mono mt-2 text-[11px] text-muted">{t.detail}</p>
        </Card>
      </li>
    ))}
  </ul>
);
