import { useCallback, useEffect, useState } from 'react';
import { API_BASE, ApiError, api } from './api.ts';
import { bootstrapSession } from './auth/bootstrap.ts';
import { ActivityFeed } from './components/ActivityFeed.tsx';
import { AdvancedProofs } from './components/AdvancedProofs.tsx';
import { GuidedDemo } from './components/GuidedDemo.tsx';
import { Hero } from './components/Hero.tsx';
import { HowItWorks } from './components/HowItWorks.tsx';
import { ProofRail } from './components/ProofRail.tsx';
import { TopNav } from './components/TopNav.tsx';
import { TrustCards } from './components/TrustCards.tsx';
import { WalletCard } from './components/WalletCard.tsx';
import { Toasts, type ToastMessage } from './components/Toast.tsx';
import { ErrorState } from './components/ui.tsx';
import { useApi } from './hooks/useApi.ts';
import { useEngine } from './hooks/useEngine.ts';
import { applyTheme, readTheme, storeTheme, type Theme } from './theme.ts';
import type { Me } from './types.ts';

type AuthState = 'checking' | 'ready' | 'failed';

const scrollTo = (hash: string) => {
  document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export default function App() {
  const [auth, setAuth] = useState<AuthState>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [theme, setThemeState] = useState<Theme>(() => readTheme());

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    storeTheme(next);
  }, []);

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

  const onChanged = useCallback(
    (what: 'deposit' | 'bet' | 'seed') => {
      if (what === 'seed') {
        void commitment.refresh();
        void revealed.refresh();
        return;
      }
      void accounts.refresh();
      void entries.refresh();
      void invariants.refresh();
      void loadMe().catch(() => undefined);
      if (what === 'bet') {
        void bets.refresh();
        void commitment.refresh();
        void affiliate.refresh();
      }
    },
    [accounts, entries, invariants, loadMe, bets, commitment, affiliate, revealed],
  );

  const engine = useEngine({ onChanged, toast });

  const apiUp = health.data?.ok === true;
  const lastBet = bets.data && bets.data.length > 0 ? bets.data[0]! : null;

  return (
    <div className="min-h-screen">
      <a
        href="#demo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to the demo
      </a>

      <TopNav apiUp={apiUp} apiLoading={health.loading} me={me} theme={theme} setTheme={setTheme} />

      <main className="mx-auto max-w-console px-4 pb-16 sm:px-6">
        {auth === 'failed' && (
          <div className="mt-6">
            <ErrorState
              error={new Error(authError ?? 'Could not start a demo session.')}
              base={API_BASE}
            />
          </div>
        )}

        <Hero
          wallet={
            <WalletCard
              me={me}
              accounts={accounts.data}
              loading={auth === 'checking'}
              depositBusy={engine.busy === 'deposit'}
              onDeposit={() => void engine.deposit(1000)}
              onRunDemo={() => scrollTo('#demo')}
            />
          }
        />

        <TrustCards />

        <div className="grid gap-10 pt-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-8">
            <GuidedDemo
              engine={engine}
              me={me}
              commitment={commitment.data}
              entries={entries.data}
              lastBet={lastBet}
            />
          </div>
          <div className="lg:col-span-4">
            <ProofRail
              invariants={invariants.data}
              commitment={commitment.data}
              verification={engine.verification}
              balanceProbe={engine.balanceProbe}
              onProbeBalance={() => void engine.probeBalanceWrite()}
              probing={engine.busy === 'balance'}
            />
          </div>
        </div>

        <ActivityFeed entries={entries.data} loading={entries.loading} />

        <AdvancedProofs
          engine={engine}
          me={me}
          accounts={accounts.data}
          entries={entries.data}
          entriesLoading={entries.loading}
          entriesError={accounts.error ?? entries.error}
          refusals={refusals.data}
          revealed={revealed.data}
          affiliate={affiliate.data}
          apiBase={API_BASE}
        />

        <HowItWorks />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-console flex-wrap items-center gap-x-6 gap-y-2 px-4 py-7 text-xs text-muted sm:px-6">
          <p>
            Everything shown is derived from the ledger. The interface holds no money state of its
            own.
          </p>
          <span className="mono ml-auto">{API_BASE}</span>
        </div>
        <div className="mx-auto flex max-w-console flex-wrap items-center gap-4 px-4 pb-8 text-xs sm:px-6">
          <a
            className="text-ink-2 underline underline-offset-2 hover:text-ink"
            href="https://github.com/Shelunagori/provable-settlement-engine#readme"
          >
            README
          </a>
          <a
            className="text-ink-2 underline underline-offset-2 hover:text-ink"
            href="https://github.com/Shelunagori/provable-settlement-engine/blob/main/docs/REFUSALS.md"
          >
            Refusal codes
          </a>
          <a
            className="text-ink-2 underline underline-offset-2 hover:text-ink"
            href="https://github.com/Shelunagori/provable-settlement-engine/blob/main/docs/DECISIONS.md"
          >
            Design decisions
          </a>
          <span className="mono ml-auto text-muted">{me?.userId ?? '—'}</span>
        </div>
      </footer>

      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
