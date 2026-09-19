import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, ApiError, api } from './api.ts';
import { bootstrapSession } from './auth/bootstrap.ts';
import { AdvancedProofs } from './components/AdvancedProofs.tsx';
import { BetCard } from './components/BetCard.tsx';
import { FairnessSection } from './components/FairnessSection.tsx';
import { Hero } from './components/Hero.tsx';
import { RecentBets } from './components/RecentBets.tsx';
import { ResetDialog } from './components/ResetDialog.tsx';
import { ResultCard } from './components/ResultCard.tsx';
import { TopNav } from './components/TopNav.tsx';
import { TrustSummary } from './components/TrustSummary.tsx';
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
  const [resetOpen, setResetOpen] = useState(false);

  // Bet inputs live here so "place another bet" can return focus to them.
  const [amount, setAmount] = useState('5.00');
  const [target, setTarget] = useState('50.00');
  const [clientSeed, setClientSeed] = useState<string>(() => crypto.randomUUID());
  const betRef = useRef<HTMLDivElement>(null);

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

  const refreshAll = useCallback(() => {
    void accounts.refresh();
    void entries.refresh();
    void invariants.refresh();
    void bets.refresh();
    void commitment.refresh();
    void revealed.refresh();
    void affiliate.refresh();
    void loadMe().catch(() => undefined);
  }, [accounts, entries, invariants, bets, commitment, revealed, affiliate, loadMe]);

  const onChanged = useCallback(
    (what: 'deposit' | 'bet' | 'seed' | 'reset') => {
      if (what === 'reset') {
        refreshAll();
        return;
      }
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
    [refreshAll, accounts, entries, invariants, loadMe, bets, commitment, affiliate, revealed],
  );

  const engine = useEngine({ onChanged, toast });

  /**
   * Whether this deployment has the demo reset at all. Taken from /health
   * rather than assumed, so a console pointed at an API without the flag does
   * not offer a button that answers 404.
   */
  const resetAvailable = health.data?.features?.demoReset === true;

  const playAgain = useCallback(() => {
    engine.restart();
    setClientSeed(crypto.randomUUID());
    betRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [engine]);

  const apiUp = health.data?.ok === true;
  const lastBet = bets.data && bets.data.length > 0 ? bets.data[0]! : null;

  return (
    <div className="min-h-screen">
      <a
        href="#play"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to betting
      </a>

      <TopNav
        apiUp={apiUp}
        apiLoading={health.loading}
        me={me}
        theme={theme}
        setTheme={setTheme}
        resetAvailable={resetAvailable}
        onReset={() => setResetOpen(true)}
      />

      <main className="mx-auto max-w-console px-4 pb-16 sm:px-6">
        {auth === 'failed' && (
          <div className="mt-6">
            <ErrorState
              error={new Error(authError ?? 'Could not start a demo session.')}
              base={API_BASE}
            />
          </div>
        )}

        <Hero />

        <div id="play" ref={betRef} className="scroll-mt-20 pt-8">
          <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5">
              <WalletCard
                me={me}
                accounts={accounts.data}
                loading={auth === 'checking'}
                depositBusy={engine.busy === 'deposit'}
                resetBusy={engine.busy === 'reset'}
                resetAvailable={resetAvailable}
                onDeposit={() => void engine.deposit(1000)}
                onReset={() => setResetOpen(true)}
              />
            </div>
            <div className="lg:col-span-7">
              <BetCard
                engine={engine}
                me={me}
                commitment={commitment.data}
                amount={amount}
                setAmount={setAmount}
                target={target}
                setTarget={setTarget}
                clientSeed={clientSeed}
                setClientSeed={setClientSeed}
                onAddCredits={() => void engine.deposit(1000)}
              />
            </div>
          </div>
        </div>

        {engine.bet && (
          <div className="pt-4">
            <ResultCard
              bet={engine.bet}
              me={me}
              entries={entries.data}
              onPlayAgain={playAgain}
              onVerify={() => scrollTo('#fairness')}
            />
          </div>
        )}

        <RecentBets bets={bets.data} loading={bets.loading} />

        <FairnessSection engine={engine} lastBet={lastBet} />

        <TrustSummary />

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
          invariants={invariants.data}
          balanceProbe={engine.balanceProbe}
          onProbeBalance={() => void engine.probeBalanceWrite()}
          probing={engine.busy === 'balance'}
          apiBase={API_BASE}
        />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-console flex-wrap items-center gap-x-6 gap-y-2 px-4 py-7 text-xs text-muted sm:px-6">
          <p>
            Demo credits only. Every balance here is summed from the ledger; the interface holds no
            money state of its own.
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

      <ResetDialog
        open={resetOpen}
        busy={engine.busy === 'reset'}
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          setResetOpen(false);
          void engine.resetDemo();
        }}
      />

      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
