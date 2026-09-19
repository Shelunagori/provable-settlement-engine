import { useCallback, useEffect, useState } from 'react';
import { API_BASE, ApiError, api } from './api.ts';
import { bootstrapSession } from './auth/bootstrap.ts';
import { ActionsPanel } from './components/ActionsPanel.tsx';
import { FairnessPanel } from './components/FairnessPanel.tsx';
import { InvariantsStrip } from './components/InvariantsStrip.tsx';
import { LedgerPanel } from './components/LedgerPanel.tsx';
import { Toasts, type ToastMessage } from './components/Toast.tsx';
import { useApi } from './hooks/useApi.ts';
import type { Me, StormResult } from './types.ts';

type AuthState = 'checking' | 'ready' | 'failed';

export default function App() {
  const [auth, setAuth] = useState<AuthState>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [storm, setStorm] = useState<StormResult | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((text: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), text }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadMe = useCallback(async () => {
    setMe(await api.me());
  }, []);

  // StrictMode mounts effects twice in development. bootstrapSession()
  // coalesces both mounts onto one in-flight attempt, so a browser boot creates
  // at most one session row.
  useEffect(() => {
    let cancelled = false;
    bootstrapSession({
      me: api.me,
      startSession: api.startSession,
      isUnauthenticated: (err) => err instanceof ApiError && err.status === 401,
    })
      .then((who) => {
        if (cancelled) return;
        setMe(who);
        setAuth('ready');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setAuthError(err.message);
        setAuth('failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const health = useApi(() => api.health(), []);
  const accounts = useApi(() => api.accounts(), []);
  const entries = useApi(() => api.entries(50), []);
  const invariants = useApi(() => api.invariants(), []);
  const bets = useApi(() => api.bets(20), []);
  const commitment = useApi(() => api.seed(), []);
  const revealed = useApi(() => api.revealedSeeds(), []);
  const refusals = useApi(() => api.refusals(), []);
  const affiliate = useApi(() => api.affiliate('affiliate:alice'), []);

  const refreshLedger = useCallback(() => {
    void accounts.refresh();
    void entries.refresh();
    void invariants.refresh();
    void loadMe().catch(() => undefined);
  }, [accounts, entries, invariants, loadMe]);

  const onChanged = useCallback(
    (what: 'deposit' | 'bet' | 'none') => {
      if (what === 'none') return;
      refreshLedger();
      if (what === 'bet') {
        void bets.refresh();
        void commitment.refresh();
        void affiliate.refresh();
      }
    },
    [refreshLedger, bets, commitment, affiliate],
  );

  const onRotated = useCallback(() => {
    void commitment.refresh();
    void revealed.refresh();
  }, [commitment, revealed]);

  const apiUp = health.data?.ok === true;
  const lastBet = bets.data && bets.data.length > 0 ? bets.data[0]! : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto max-w-console px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="num text-base font-medium">ledgerproof</h1>
              <p className="text-sm text-muted">
                A settlement ledger that shows its work: balances derived, refusals server-side,
                outcomes anyone can recompute.
              </p>
            </div>
            <div
              className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5"
              aria-live="polite"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  health.loading ? 'bg-pending' : apiUp ? 'bg-accent' : 'bg-refusal'
                }`}
                aria-hidden="true"
              />
              <span className="num text-xs text-muted">
                api{' '}
                {health.loading
                  ? 'checking'
                  : apiUp
                    ? `up · ${health.data?.migrations.length ?? 0} migrations`
                    : 'unreachable'}
              </span>
            </div>
          </div>

          <div className="mt-3">
            <InvariantsStrip
              invariants={invariants.data}
              commitment={commitment.data}
              storm={storm}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-console px-4 py-6">
        {auth === 'failed' && (
          <div className="mb-4 rounded border border-refusal/40 px-3 py-3 text-sm">
            <p className="font-medium text-refusal">Could not start a demo session.</p>
            <p className="mt-1 text-muted">
              {authError} · API at <span className="num">{API_BASE}</span>
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <LedgerPanel
              accounts={accounts.data}
              entries={entries.data}
              affiliate={affiliate.data}
              loading={entries.loading}
              error={accounts.error ?? entries.error}
              apiBase={API_BASE}
            />
          </div>
          <div className="lg:col-span-4">
            <ActionsPanel
              me={me}
              commitment={commitment.data}
              refusals={refusals.data}
              toast={toast}
              onStorm={setStorm}
              onChanged={onChanged}
            />
          </div>
          <div className="lg:col-span-3">
            <FairnessPanel
              commitment={commitment.data}
              revealed={revealed.data}
              lastBet={lastBet}
              onRotated={onRotated}
              toast={toast}
            />
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-console px-4 pb-10 text-xs text-muted">
        <p>
          Everything you see is derived from the ledger. The UI has no financial state of its own.
        </p>
        <p className="mt-1 flex flex-wrap gap-3">
          <a className="underline hover:text-ink" href="https://github.com/Shelunagori/provable-settlement-engine#readme">
            README
          </a>
          <a
            className="underline hover:text-ink"
            href="https://github.com/Shelunagori/provable-settlement-engine/blob/main/docs/REFUSALS.md"
          >
            docs/REFUSALS.md
          </a>
          <a
            className="underline hover:text-ink"
            href="https://github.com/Shelunagori/provable-settlement-engine/blob/main/docs/DECISIONS.md"
          >
            docs/DECISIONS.md
          </a>
          <span className="num">api {API_BASE}</span>
        </p>
      </footer>

      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
