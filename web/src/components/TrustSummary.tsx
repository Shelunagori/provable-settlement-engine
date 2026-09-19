import { Card } from './ui.tsx';
import { CopyIcon, LockIcon, ScalesIcon, ShieldCheckIcon } from './icons.tsx';

const GUARANTEES = [
  {
    icon: ScalesIcon,
    title: 'Money is ledger-backed',
    body: 'Balance cannot be directly edited',
  },
  {
    icon: CopyIcon,
    title: 'Duplicate-safe payments',
    body: 'The same payment settles once',
  },
  {
    icon: LockIcon,
    title: 'Server-enforced limits',
    body: 'The browser cannot override wagering rules',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Verifiable results',
    body: 'A settled result can be reproduced independently',
  },
];

export const TrustSummary = () => (
  <section className="pt-14">
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {GUARANTEES.map(({ icon: Icon, ...g }) => (
        <li key={g.title}>
          <Card as="div" className="h-full p-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
              <Icon className="h-4 w-4" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">{g.title}</h3>
            <p className="mt-1 text-sm leading-snug text-ink-2">{g.body}</p>
          </Card>
        </li>
      ))}
    </ul>
  </section>
);
