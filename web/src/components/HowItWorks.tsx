import { Card, SectionHeading } from './ui.tsx';
import {
  CopyIcon,
  FingerprintIcon,
  LockIcon,
  ScalesIcon,
  ShieldCheckIcon,
} from './icons.tsx';

const GUARANTEES = [
  {
    icon: ScalesIcon,
    title: 'Balanced ledger',
    body: 'Every movement is a set of postings that sums to zero, enforced by the database itself.',
    test: 'sum_is_zero.test.ts',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Derived balances',
    body: 'A balance is summed from postings when you ask for it. Nothing stores one.',
    test: 'balance_is_derived.test.ts',
  },
  {
    icon: CopyIcon,
    title: 'Duplicate-safe payments',
    body: 'A payment is claimed by its event id, so repeats lose the race instead of moving money.',
    test: 'exactly_once.test.ts',
  },
  {
    icon: LockIcon,
    title: 'Server-side limits',
    body: 'Funds, limits and validity are decided on the server and answered with a named code.',
    test: 'never_negative.test.ts',
  },
  {
    icon: FingerprintIcon,
    title: 'Verifiable outcomes',
    body: 'The result is fixed by a published commitment and can be recomputed by anyone.',
    test: 'deterministic_outcome.test.ts',
  },
];

export const HowItWorks = () => (
  <section id="how" className="scroll-mt-20 pt-14">
    <SectionHeading
      eyebrow="How it works"
      title="Five guarantees behind every result"
      lead="The interface cannot relax any of them, because it never decides anything."
    />
    <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {GUARANTEES.map(({ icon: Icon, ...g }) => (
        <li key={g.title}>
          <Card as="div" className="h-full p-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
              <Icon className="h-4 w-4" />
            </span>
            <h3 className="mt-3 text-base font-semibold">{g.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{g.body}</p>
            <p className="mono mt-3 text-[11px] text-muted">{g.test}</p>
          </Card>
        </li>
      ))}
    </ul>
  </section>
);
