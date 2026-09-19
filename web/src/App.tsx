import { useEffect, useState } from 'react';
import { API_BASE, getHealth, type Health } from './api.ts';

type Status = 'loading' | 'ok' | 'down';

const Panel = ({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children?: React.ReactNode;
}) => (
  <section className="rounded-lg border border-line bg-surface">
    <header className="border-b border-line px-4 py-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </header>
    <div className="px-4 py-4 text-sm">{children}</div>
  </section>
);

export default function App() {
  const [status, setStatus] = useState<Status>('loading');
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    getHealth()
      .then((h) => {
        if (!alive) return;
        setHealth(h);
        setStatus(h.ok ? 'ok' : 'down');
      })
      .catch(() => alive && setStatus('down'));
    return () => {
      alive = false;
    };
  }, []);

  const dot =
    status === 'ok' ? 'bg-accent' : status === 'down' ? 'bg-refusal' : 'bg-pending';

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-console flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="num text-base font-medium">provable-settlement-engine</h1>
            <p className="text-sm text-muted">
              Every balance is derived. Every refusal is server-side. Every outcome is reproducible.
            </p>
          </div>
          <div
            className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5"
            aria-live="polite"
          >
            <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
            <span className="num text-xs text-muted">
              api{' '}
              {status === 'loading'
                ? 'checking'
                : status === 'ok'
                  ? `up · ${health?.migrations.length ?? 0} migrations`
                  : 'unreachable'}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-console px-4 py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Panel label="Ledger" description="Accounts and the journal, newest entry first.">
              <p className="text-muted">Awaiting the ledger core.</p>
            </Panel>
          </div>
          <div className="lg:col-span-4">
            <Panel label="Actions" description="Every action here writes a journal entry or is refused.">
              <p className="text-muted">Awaiting the ledger core.</p>
            </Panel>
          </div>
          <div className="lg:col-span-3">
            <Panel label="Fairness" description="Seed custody, commitment and local verification.">
              <p className="text-muted">Awaiting seed custody.</p>
            </Panel>
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-console px-4 pb-10 text-xs text-muted">
        <p>
          The console holds no state of its own; everything shown is derived from the ledger at{' '}
          <span className="num">{API_BASE}</span>.
        </p>
      </footer>
    </div>
  );
}
