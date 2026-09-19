import type { ReactNode } from 'react';
import { Button } from './ui.tsx';

const scrollTo = (hash: string) => {
  document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export const Hero = ({ wallet }: { wallet: ReactNode }) => (
  <section className="scroll-mt-20 pt-8 sm:pt-10" id="top">
    <div className="grid gap-6 lg:grid-cols-12 lg:items-center lg:gap-8">
      <div className="lg:col-span-7">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Proof-driven settlement
        </p>
        <h1 className="text-hero font-semibold">
          Every transaction.
          <br />
          Every outcome.
          <br />
          <span className="text-accent-text">Provable.</span>
        </h1>
        <p className="mt-4 max-w-lg text-base text-ink-2">
          Transparent settlement where every balance, payment and outcome can be independently
          verified.
        </p>
        <p className="mt-1.5 max-w-lg text-sm text-muted">
          Powered by a double-entry ledger and server-side enforcement.
        </p>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
          <Button variant="primary" size="lg" onClick={() => scrollTo('#demo')}>
            Start live demo
          </Button>
          <Button variant="secondary" size="lg" onClick={() => scrollTo('#how')}>
            How it works
          </Button>
        </div>
      </div>

      <div className="lg:col-span-5">{wallet}</div>
    </div>
  </section>
);
