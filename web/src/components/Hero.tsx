import type { ReactNode } from 'react';
import { Button, Card } from './ui.tsx';

const TRUST = [
  {
    title: 'Ledger balanced',
    body: 'Every movement is double-entry, and the database refuses an entry that does not balance.',
    detail: 'Σ postings = 0',
    tone: 'text-accent',
  },
  {
    title: 'Balance derived',
    body: 'Balances are summed from postings at read time. Nothing can write one directly.',
    detail: 'No balance column',
    tone: 'text-accent',
  },
  {
    title: 'Payments settle once',
    body: 'The same payment notification can arrive any number of times and moves money once.',
    detail: 'Duplicate-safe by event id',
    tone: 'text-fairness',
  },
  {
    title: 'Outcome committed',
    body: 'A commitment is published before an outcome exists and the secret is revealed after.',
    detail: 'Checkable in your browser',
    tone: 'text-fairness',
  },
];

const scrollTo = (hash: string) => {
  document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export const Hero = ({ wallet }: { wallet: ReactNode }) => (
  <section className="scroll-mt-24 pt-10 sm:pt-14" id="top">
    <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
      <div className="lg:col-span-7">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Server-authoritative settlement engine
        </p>
        <h1 className="text-hero font-semibold">
          Every transaction.
          <br />
          Every outcome.
          <br />
          <span className="text-accent">Provable.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
          Money moves through a double-entry ledger, duplicate payments settle once, and every
          outcome is committed before it happens — so you can recompute it yourself, here, in this
          browser.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button variant="primary" size="lg" onClick={() => scrollTo('#demo')}>
            Start the live demo
          </Button>
          <Button variant="secondary" size="lg" onClick={() => scrollTo('#how')}>
            See how it works
          </Button>
        </div>
      </div>

      <div className="lg:col-span-5">{wallet}</div>
    </div>

    <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {TRUST.map((t) => (
        <Card key={t.title} className="p-4" raised>
          <h2 className="text-sm font-semibold">{t.title}</h2>
          <p className="mt-1.5 text-sm leading-snug text-muted">{t.body}</p>
          <p className={`mono mt-3 text-[11px] ${t.tone}`}>{t.detail}</p>
        </Card>
      ))}
    </div>
  </section>
);
