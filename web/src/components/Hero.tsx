import { Button } from './ui.tsx';

const scrollTo = (hash: string) => {
  document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export const Hero = () => (
  <section className="scroll-mt-20 pt-8 sm:pt-10" id="top">
    <div className="max-w-2xl">
      <h1 className="text-hero font-semibold">
        Place a bet.
        <br />
        See the result.
        <br />
        <span className="text-accent-text">Verify it yourself.</span>
      </h1>
      <p className="mt-4 text-base text-ink-2">
        A demo wagering engine where the server settles every bet, your balance is backed by a
        double-entry ledger, and every result can be independently verified.
      </p>
      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        <Button variant="primary" size="lg" onClick={() => scrollTo('#play')}>
          Start betting
        </Button>
        <Button variant="secondary" size="lg" onClick={() => scrollTo('#fairness')}>
          How fairness works
        </Button>
      </div>
    </div>
  </section>
);
