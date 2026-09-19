import { useEffect, useState, type ReactNode } from 'react';
import { API_BASE, api } from '../../api.ts';
import { Badge, Button, Card, Disclosure, SectionHeading, StatusDot } from '../ui.tsx';
import {
  ActivityIcon,
  CheckCircleIcon,
  CopyIcon,
  FingerprintIcon,
  LockIcon,
  RowsIcon,
  ScalesIcon,
  ShieldCheckIcon,
  WalletIcon,
} from '../icons.tsx';
import { Entry } from './Entry.tsx';
import { Flow } from './Flow.tsx';
import { ReviewNav } from './ReviewNav.tsx';
import { Stack } from './Stack.tsx';
import { WinBand } from './WinBand.tsx';
import { LINKS, navigate } from '../../routing.ts';
import type { Theme } from '../../theme.ts';
import type { Health } from '../../types.ts';

const Section = ({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) => (
  <section id={id} className="scroll-mt-20 pt-14">
    <SectionHeading eyebrow={eyebrow} title={title} lead={lead} />
    {children}
  </section>
);

const Tile = ({
  icon: Icon,
  title,
  body,
}: {
  icon?: (p: { className?: string }) => JSX.Element;
  title: string;
  body: string;
}) => (
  <Card as="div" className="h-full p-4">
    {Icon && (
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
        <Icon className="h-4 w-4" />
      </span>
    )}
    <h3 className={`text-sm font-semibold ${Icon ? 'mt-3' : ''}`}>{title}</h3>
    <p className="mt-1.5 text-sm leading-snug text-ink-2">{body}</p>
  </Card>
);

const Line = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-6 border-b border-line py-1.5 last:border-0">
    <dt className="text-sm text-ink-2">{label}</dt>
    <dd className="num text-sm">{value}</dd>
  </div>
);

const Chips = ({ items, tone = 'muted' }: { items: string[]; tone?: 'muted' | 'refusal' }) => (
  <ul className="flex flex-wrap gap-1.5">
    {items.map((i) => (
      <li
        key={i}
        className={`rounded-md border px-2 py-1 text-xs ${
          tone === 'refusal'
            ? 'border-refusal-border bg-refusal-soft text-refusal'
            : 'border-line bg-subtle text-ink-2'
        }`}
      >
        {i}
      </li>
    ))}
  </ul>
);

export const ReviewPage = ({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
}) => {
  // The status strip is an extra, never a dependency: a review page that goes
  // blank because a demo API is asleep is a worse page than one that says so.
  const [health, setHealth] = useState<Health | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((h) => !cancelled && setHealth(h))
      .catch(() => !cancelled && setHealthFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <a
        href="#overview"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to the overview
      </a>

      <ReviewNav theme={theme} setTheme={setTheme} />

      <main className="mx-auto max-w-console px-4 pb-16 sm:px-6">
        {/* ---------------------------------------------------------------- */}
        <section id="top" className="scroll-mt-20 pt-10 sm:pt-12">
          <div className="max-w-3xl">
            <Badge tone="fairness">Proof of concept</Badge>
            <h1 className="mt-4 text-hero font-semibold">
              Provable settlement for wagering systems
            </h1>
            <p className="mt-4 text-base text-ink-2 sm:text-lg">
              ledgerproof is a server-authoritative wagering POC that demonstrates how deposits,
              balances, bets, payouts and verifiable outcomes can be processed safely under
              concurrency.
            </p>
            <p className="mt-3 text-base text-ink">
              The interface demonstrates the system. The API and PostgreSQL remain the authority.
            </p>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              <Button variant="primary" size="lg" onClick={() => navigate('/')}>
                Open live demo
              </Button>
              <a
                href={LINKS.repo}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-5 py-3 text-base font-medium text-ink hover:border-muted"
              >
                View source
              </a>
            </div>

            <p className="mt-6 text-xs text-muted">
              {healthFailed ? (
                <StatusDot tone="pending" label="Live API status unavailable right now" />
              ) : health ? (
                <StatusDot
                  tone={health.ok ? 'accent' : 'refusal'}
                  label={
                    health.ok
                      ? 'API online · database connected'
                      : 'API reachable · database not connected'
                  }
                />
              ) : (
                <StatusDot tone="muted" label="Checking the live API…" />
              )}
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="overview"
          eyebrow="Overview"
          title="What did I build?"
          lead="A wagering settlement engine where a user can fund a demo wallet, choose a stake and target, place a bet and receive a server-generated win or loss."
        >
          <p className="mb-6 max-w-3xl text-ink-2">
            Behind that simple flow, every financial movement is recorded in a double-entry ledger,
            duplicate payment events settle once, server-side rules cannot be bypassed by the
            browser, and settled outcomes can later be independently verified.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: WalletIcon, title: 'Wallet & ledger', body: 'Balances come from financial postings.' },
              { icon: ScalesIcon, title: 'Wagering engine', body: 'The server validates and settles every bet.' },
              { icon: CopyIcon, title: 'Payment safety', body: 'Duplicate payment events cannot double-credit a wallet.' },
              { icon: FingerprintIcon, title: 'Verifiable outcomes', body: 'The browser can independently reproduce settled results.' },
            ].map((c) => (
              <li key={c.title}>
                <Tile {...c} />
              </li>
            ))}
          </ul>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section id="user-flow" eyebrow="User flow" title="What does the user actually do?">
          <Card as="div" className="max-w-2xl p-5">
            <Flow
              steps={[
                { title: 'Add credits', body: 'Fund the demo wallet through the payment-processing path.' },
                { title: 'Choose bet amount', body: 'Choose how many demo credits to stake.' },
                { title: 'Choose target', body: 'Choose the number the generated result must fall below.' },
                { title: 'Place bet', body: 'The server validates the request before accepting it.' },
                { title: 'See win or loss', body: 'The server generates and settles the outcome atomically.' },
                { title: 'Verify fairness', body: 'After reveal, the browser independently reproduces the same result.' },
              ]}
            />
          </Card>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="mechanic"
          eyebrow="The mechanic"
          title="How does a bet work?"
          lead="One number decides it. The server generates a result between 0.00 and 99.99, and you win when it lands below the target you picked."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Card as="div" tier="primary" className="p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
                An example bet
              </h3>
              <dl className="mt-3">
                <Line label="Wallet balance" value="100.00 credits" />
                <Line label="Bet amount" value="5.00 credits" />
                <Line label="Target" value="50.00" />
                <Line label="Win condition" value="Result < 50.00" />
                <Line label="Potential payout" value="9.90 credits" />
              </dl>
              <div className="mt-5">
                <WinBand target={50} />
              </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Card as="div" className="border-accent-border bg-accent-soft p-5">
                <p className="text-sm font-semibold uppercase tracking-wider text-accent-text">
                  You win
                </p>
                <p className="num mt-2 text-3xl font-semibold text-accent-text">41.72</p>
                <p className="mt-1 text-sm text-ink-2">
                  The result was <span className="mono">41.72</span> and the target was{' '}
                  <span className="mono">50.00</span>.
                </p>
                <p className="mono mt-2 text-sm text-accent-text">41.72 &lt; 50.00</p>
              </Card>

              <Card as="div" className="border-refusal-border bg-refusal-soft p-5">
                <p className="text-sm font-semibold uppercase tracking-wider text-refusal">
                  You lose
                </p>
                <p className="num mt-2 text-3xl font-semibold text-refusal">81.11</p>
                <p className="mt-1 text-sm text-ink-2">
                  The result was <span className="mono">81.11</span> and the target was{' '}
                  <span className="mono">50.00</span>.
                </p>
                <p className="mono mt-2 text-sm text-refusal">81.11 ≥ 50.00</p>
              </Card>
            </div>
          </div>

          <p className="mt-4 max-w-3xl text-sm text-ink-2">
            A lower target is harder to hit and pays more; a higher target is easier and pays less.
            Landing exactly on the target is a loss — the comparison is strictly "below".
          </p>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="pipeline"
          eyebrow="Behind the button"
          title="What happens behind the button?"
          lead="One request, one database transaction. Either all of it happens or none of it does."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Card as="div" className="p-5">
              <Flow
                tone="fairness"
                steps={[
                  { title: 'Browser', body: 'Sends the amount, target and client seed.' },
                  { title: 'Authenticated request', body: 'A signed session cookie identifies the wallet.' },
                  { title: 'Server validates the bet', body: 'Every rule below is checked server-side.' },
                  { title: "Lock the user's financial account", body: 'So two requests cannot spend the same funds.' },
                  { title: 'Check available funds', body: 'Summed from postings inside the same transaction.' },
                  { title: 'Allocate a nonce', body: 'One number per bet, never reused for a seed.' },
                  { title: 'Compute the outcome', body: 'Derived from the committed secret, not from chance at this moment.' },
                  { title: 'Create ledger postings', body: 'The stake moves, then the settlement moves.' },
                  { title: 'Settle the round', body: 'The round reaches its final state.' },
                  { title: 'Return the result', body: 'The browser displays what the server decided.' },
                ]}
              />
            </Card>

            <div className="space-y-4">
              <Card as="div" className="p-5">
                <h3 className="text-sm font-semibold">Validation covers</h3>
                <div className="mt-3">
                  <Chips
                    items={[
                      'authentication',
                      'minimum stake',
                      'maximum stake',
                      'target validity',
                      'available funds',
                      'daily-loss limit',
                      'round status',
                      'duplicate bet protection',
                      'active seed state',
                    ]}
                  />
                </div>
              </Card>

              <Card as="div" className="border-accent-border bg-accent-soft p-5">
                <div className="flex items-center gap-2">
                  <LockIcon className="h-4 w-4 text-accent-text" />
                  <h3 className="text-sm font-semibold text-accent-text">Why lock the account?</h3>
                </div>
                <p className="mt-2 text-sm text-ink-2">
                  Two requests may arrive at the same time. ledgerproof locks the user's financial
                  account while checking and settling a bet, preventing two concurrent requests
                  from spending the same available funds.
                </p>
                <p className="mono mt-2 text-xs text-muted">
                  Implemented with PostgreSQL row locking.
                </p>
              </Card>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section id="ledger" eyebrow="Ledger" title="How does the money move?">
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="text-ink-2">
                ledgerproof does not store an editable user balance. A balance is derived by summing
                ledger postings, and every journal entry must add up to zero.
              </p>
              <p className="mt-3 text-ink-2">
                That is what makes the balance impossible to drift: there is no number to correct,
                only a history to sum. It is also what makes it impossible to edit — there is no
                field to write to.
              </p>
              <Card as="div" className="mt-4 border-accent-border bg-accent-soft p-4">
                <p className="text-sm font-medium text-accent-text">
                  There is no mutable balance field that the browser can update.
                </p>
                <p className="mono mt-2 text-xs text-muted">PUT /balance → 404</p>
              </Card>
            </div>

            <div className="space-y-3">
              <Entry
                title="Deposit 10.00"
                legs={[
                  { account: 'Payment gateway', amount: '-10.00' },
                  { account: 'Demo wallet', amount: '+10.00' },
                ]}
              />
              <Entry
                title="Stake 5.00 reserved"
                legs={[
                  { account: 'Demo wallet', amount: '-5.00' },
                  { account: 'Pending bets', amount: '+5.00' },
                ]}
              />
              <Entry
                title="Loss settled"
                legs={[
                  { account: 'Pending bets', amount: '-5.00' },
                  { account: 'Treasury', amount: '+5.00' },
                ]}
              />
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="payments"
          eyebrow="Payments"
          title="What if the payment provider retries the same event?"
          lead="Payment providers retry webhooks in real systems. ledgerproof records the provider event ID and guarantees that one payment event can create only one deposit."
        >
          <Card as="div" className="p-5">
            <ul className="grid gap-3 sm:grid-cols-4">
              {[
                { value: '20', label: 'deliveries' },
                { value: '1', label: 'posted' },
                { value: '19', label: 'deduplicated' },
                { value: '1', label: 'ledger entry' },
              ].map((s) => (
                <li
                  key={s.label}
                  className="rounded-lg border border-line bg-subtle px-3 py-3 text-center"
                >
                  <p className="num text-3xl font-semibold">{s.value}</p>
                  <p className="mt-0.5 text-xs text-muted">{s.label}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink-2">
              Even when the 20 requests arrive concurrently. You can run this yourself in the demo,
              under <span className="font-medium">Advanced proofs → Duplicate protection</span>.
            </p>
          </Card>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="fairness"
          eyebrow="Fairness"
          title="How can the result be independently verified?"
          lead="Before a bet, the server publishes a commitment to a secret. The secret itself remains hidden."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Card as="div" className="p-5">
              <p className="text-sm text-ink-2">
                After the secret is rotated and revealed, the browser can verify that it matches the
                earlier commitment and independently reproduce the exact same result. The server
                cannot change a secret it has already published a commitment to.
              </p>
              <div className="mt-5">
                <Flow
                  tone="fairness"
                  steps={[
                    { title: 'Server secret', body: 'Generated and kept hidden.' },
                    { title: 'Create commitment', body: 'A one-way fingerprint of that secret.' },
                    { title: 'Publish commitment', body: 'Visible before anyone bets.' },
                    { title: 'User places bet', body: 'The secret is still hidden.' },
                    { title: 'Server calculates result', body: 'From the secret, your seed and the nonce.' },
                    { title: 'Secret later revealed', body: 'Once that secret is retired from use.' },
                    { title: 'Browser recalculates', body: 'Using Web Crypto, without asking the API.' },
                    { title: 'Match', body: 'The browser and the server agree, or the claim fails.' },
                  ]}
                />
              </div>
            </Card>

            <Card as="div" className="p-5">
              <h3 className="text-sm font-semibold">Why this ordering matters</h3>
              <p className="mt-2 text-sm text-ink-2">
                A result you cannot check is a promise. A result you can recompute from a value that
                was fixed before you played is evidence. The commitment is what ties the two
                together: it is published first, and it is what the revealed secret has to match.
              </p>

              <Disclosure summary="Technical details" className="mt-4">
                <dl className="space-y-3">
                  <div>
                    <dt className="font-medium text-ink">Server seed</dt>
                    <dd className="text-ink-2">
                      32 random bytes rendered as 64 lowercase hex characters.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink">Commitment</dt>
                    <dd className="mono text-ink-2">SHA256(serverSeed)</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink">Outcome</dt>
                    <dd>
                      <pre className="mono mt-1 overflow-x-auto rounded-lg border border-line bg-subtle px-3 py-2 text-[11px]">
{`HMAC-SHA256(
  key     = serverSeed,
  message = clientSeed + ":" + nonce
)

first 8 hex characters
  -> unsigned integer
  -> modulo 10000
  -> 0.00-99.99 result`}
                      </pre>
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink">Winning condition</dt>
                    <dd className="mono text-ink-2">result &lt; target</dd>
                    <dd className="mt-1 text-ink-2">
                      Strictly below. A result equal to the target is a loss, and the comparison is
                      done on integer hundredths so it cannot be rounded into a win.
                    </dd>
                  </div>
                </dl>
              </Disclosure>
            </Card>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section id="authority" eyebrow="Authority" title="Who decides what?">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card as="div" className="p-5">
              <h3 className="text-base font-semibold">Browser</h3>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">Can</p>
              <div className="mt-2">
                <Chips
                  items={[
                    'choose amount',
                    'choose target',
                    'choose client seed',
                    'display server data',
                    'request actions',
                    'verify a settled result',
                  ]}
                />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">
                Cannot decide
              </p>
              <div className="mt-2">
                <Chips
                  tone="refusal"
                  items={[
                    'available balance',
                    'stake validity',
                    'daily-loss limits',
                    'outcome',
                    'payout',
                    'nonce',
                    'round state',
                    'commission',
                    'payment idempotency',
                  ]}
                />
              </div>
            </Card>

            <Card as="div" tier="primary" className="p-5">
              <h3 className="text-base font-semibold">API + PostgreSQL</h3>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">
                Authoritative for
              </p>
              <div className="mt-2">
                <Chips
                  items={[
                    'financial state',
                    'validation',
                    'concurrency',
                    'settlement',
                    'outcomes',
                    'payout',
                    'nonce allocation',
                    'round lifecycle',
                    'payment handling',
                    'affiliate commission',
                  ]}
                />
              </div>
            </Card>
          </div>

          <p className="mt-4 text-center text-base font-medium">
            The frontend is never trusted as the financial authority.
          </p>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="refusals"
          eyebrow="Protections"
          title="What happens when a request is invalid?"
          lead="A rejected action returns a named code, an HTTP status and structured detail — not a generic failure."
        >
          <Card as="div" className="p-5">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Insufficient funds', 'INSUFFICIENT_FUNDS · 409'],
                ['Bet below minimum', 'BET_BELOW_MIN · 422'],
                ['Bet above maximum', 'BET_ABOVE_MAX · 422'],
                ['Daily loss limit', 'DAILY_LOSS_LIMIT · 429'],
                ['Closed round', 'ROUND_CLOSED · 409'],
              ].map(([label, code]) => (
                <li key={code} className="rounded-lg border border-line bg-subtle px-3 py-2.5">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mono mt-0.5 text-xs text-refusal">{code}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink-2">
              The engine defines nine structured refusal conditions. The table is generated from the
              same source the server enforces, so the documentation cannot drift from the behaviour.
            </p>
            <p className="mt-2">
              <a
                href={LINKS.refusals}
                className="text-sm text-accent-text underline underline-offset-2"
              >
                View all refusal codes
              </a>
            </p>
          </Card>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section id="persistence" eyebrow="State" title="Why does the wallet survive refresh?">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card as="div" className="p-5">
              <p className="text-ink-2">
                Because the wallet lives on the server, not in React. Refreshing the browser reloads
                the same PostgreSQL-backed state.
              </p>
              <p className="mt-3 text-sm text-ink-2">
                It is a small thing to notice and an easy one to fake, which is why it is worth
                trying: add credits, reload the page, and the balance is still there.
              </p>
            </Card>

            <Card as="div" className="p-5">
              <h3 className="text-base font-semibold">Reset demo</h3>
              <p className="mt-2 text-ink-2">
                The public POC has a dedicated environment reset that returns the demo dataset to
                its clean starting state.
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
                {[
                  'It is not a writable balance endpoint.',
                  'It cannot target arbitrary users.',
                  'It exists only when DEMO_RESET_ENABLED=true.',
                ].map((l) => (
                  <li key={l} className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section id="architecture" eyebrow="Architecture" title="System architecture">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div className="max-w-xl">
              <Stack
                tiers={[
                  {
                    platform: 'Vercel',
                    title: 'React + Vite',
                    role: 'Interaction + independent verification',
                    items: ['User interaction', 'Browser verifier'],
                  },
                  {
                    platform: 'Railway',
                    title: 'Fastify API',
                    role: 'Domain authority',
                    items: ['Sessions', 'Payments', 'Wagering', 'Fairness', 'Ledger', 'Demo reset'],
                  },
                  {
                    platform: 'Railway',
                    title: 'PostgreSQL 16',
                    role: 'Financial authority',
                    items: [
                      'Ledger + postings',
                      'Bets',
                      'Rounds',
                      'Fairness seeds',
                      'Webhook events',
                      'Sessions',
                    ],
                  },
                ]}
              />
            </div>

            <div>
              <h3 className="text-base font-semibold">Technology</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  { title: 'Frontend', items: ['React 18', 'TypeScript', 'Vite', 'Tailwind CSS', 'Web Crypto API'] },
                  { title: 'Backend', items: ['Node.js', 'TypeScript', 'Fastify', 'pg'] },
                  { title: 'Database', items: ['PostgreSQL 16', 'transactions', 'row locks', 'constraints', 'triggers'] },
                  { title: 'Testing', items: ['Vitest', 'integration tests against PostgreSQL', 'concurrency tests', 'property-based testing', 'browser acceptance'] },
                  { title: 'Deployment', items: ['Vercel', 'Railway'] },
                ].map((g) => (
                  <Card as="div" key={g.title} className="p-4">
                    <h4 className="text-sm font-semibold">{g.title}</h4>
                    <ul className="mt-2 space-y-0.5 text-sm text-ink-2">
                      {g.items.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section id="testing" eyebrow="Testing" title="How was correctness tested?">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                icon: ScalesIcon,
                title: 'API and domain tests',
                items: ['wager validation', 'payout calculations', 'refusal contracts', 'fairness vectors', 'session behaviour'],
              },
              {
                icon: RowsIcon,
                title: 'Database tests',
                items: ['ledger balance', 'negative-balance prevention', 'round transitions', 'payment uniqueness', 'reset behaviour'],
              },
              {
                icon: ActivityIcon,
                title: 'Concurrency tests',
                items: ['simultaneous bets', 'duplicate webhook delivery', 'seed rotation', 'demo reset races'],
              },
              {
                icon: ShieldCheckIcon,
                title: 'Browser acceptance',
                items: ['the full wagering journey', 'both themes', 'four viewport widths', 'contrast measured on the rendered page'],
              },
            ].map(({ icon: Icon, ...g }) => (
              <Card as="div" key={g.title} className="p-5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
                  <Icon className="h-4 w-4" />
                </span>
                <h3 className="mt-3 text-sm font-semibold">{g.title}</h3>
                <ul className="mt-2 space-y-0.5 text-sm text-ink-2">
                  {g.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>

          <Card as="div" className="mt-3 p-5">
            <h3 className="text-sm font-semibold">Property-based testing</h3>
            <p className="mt-2 text-sm text-ink-2">
              Random operation sequences perform deposits, bets, seed rotation and webhook replay
              while checking the system invariants after each step. The oracle is written
              independently of the production code, so a bug copied into both would still be caught.
            </p>
          </Card>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section id="invariants" eyebrow="Invariants" title="What must always remain true?">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              'Every ledger entry sums to zero.',
              'A user financial account cannot go negative.',
              'One webhook event can move money only once.',
              'Exactly one server seed is active.',
              'A seed and nonce pair cannot be reused.',
              'A settled result must match the deterministic fairness algorithm.',
            ].map((t) => (
              <li key={t}>
                <Card as="div" className="flex h-full items-start gap-2.5 p-4">
                  <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
                  <p className="text-sm">{t}</p>
                </Card>
              </li>
            ))}
          </ul>
          <p className="mt-3">
            <a
              href={LINKS.invariants}
              className="text-sm text-accent-text underline underline-offset-2"
            >
              View invariant proofs
            </a>
          </p>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section id="decisions" eyebrow="Decisions" title="Key engineering decisions">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Derived balance', 'Financial state cannot drift away from transaction history.'],
              ['Database-enforced accounting', 'The database is the final guard for balanced entries.'],
              ['Pessimistic locking', 'Correctness is prioritised when concurrent requests compete for money.'],
              ['Server authority', 'Client validation improves UX but never decides financial validity.'],
              ['Independent verifier', "The browser recomputes the fairness result instead of asking the API whether the API's own result is correct."],
            ].map(([title, body]) => (
              <li key={title}>
                <Tile title={title!} body={body!} />
              </li>
            ))}
          </ul>
          <p className="mt-3">
            <a
              href={LINKS.decisions}
              className="text-sm text-accent-text underline underline-offset-2"
            >
              View full decision log
            </a>
          </p>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section id="production" eyebrow="Scope" title="What does this POC prove?">
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <Card as="div" className="border-accent-border bg-accent-soft p-5">
              <h3 className="text-base font-semibold text-accent-text">Demonstrated here</h3>
              <ul className="mt-3 space-y-1.5 text-sm">
                {[
                  'double-entry financial model',
                  'derived balances',
                  'server-side wager validation',
                  'concurrency-safe spending',
                  'duplicate-safe payment processing',
                  'deterministic provable outcomes',
                  'round settlement',
                  'affiliate settlement',
                  'session boundary',
                  'demo reset',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
                    <span className="text-ink-2">{t}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card as="div" className="p-5">
              <h3 className="text-base font-semibold">
                What would a production platform still need?
              </h3>
              <p className="mt-2 text-sm text-ink-2">
                This is a proof of concept. It does not claim to include any of the following, and
                none of them are simulated:
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
                {[
                  'real payment-provider integration',
                  'real-money custody',
                  'customer onboarding and KYC',
                  'jurisdiction-specific compliance',
                  'responsible-gaming controls',
                  'production admin tooling',
                  'a full abuse and rate-limit strategy',
                  'production secret management and custody',
                  'complete observability and on-call setup',
                  'backup and disaster-recovery procedures',
                  'a formal production security review',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden="true" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="try"
          eyebrow="Try it"
          title="Review this POC in 5 minutes"
          lead="Everything below happens against the live API and a real PostgreSQL database."
        >
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <Card as="div" tier="primary" className="p-5">
              <ol className="space-y-2.5">
                {[
                  'Reset demo',
                  'Add 10 credits',
                  'Place a 5-credit bet with target 50',
                  'Inspect win or loss and the updated balance',
                  'Verify the result in the browser',
                  'Run the duplicate-payment proof',
                  'Attempt a balance write',
                  'Review architecture and invariants',
                ].map((step, i) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="mono mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[11px] text-muted">
                      {i + 1}
                    </span>
                    <span className="text-sm">{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-5">
                <Button variant="primary" size="lg" onClick={() => navigate('/')}>
                  Open live demo →
                </Button>
              </div>
            </Card>

            <Card as="div" className="p-5">
              <h3 className="text-base font-semibold">Live POC</h3>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-muted">Live frontend</dt>
                  <dd className="mono mt-0.5 break-all">
                    <a
                      href={LINKS.liveDemo}
                      className="text-accent-text underline underline-offset-2"
                    >
                      {LINKS.liveDemo}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">API</dt>
                  <dd className="mono mt-0.5 break-all text-ink-2">{API_BASE}</dd>
                </div>
              </dl>

              <p className="mt-4 text-xs">
                {healthFailed ? (
                  <StatusDot tone="pending" label="Live API status unavailable right now" />
                ) : health ? (
                  <span className="space-y-1">
                    <StatusDot tone={health.ok ? 'accent' : 'refusal'} label="API online" />
                    <br />
                    <StatusDot
                      tone={health.db ? 'accent' : 'refusal'}
                      label={health.db ? 'Database connected' : 'Database not connected'}
                    />
                  </span>
                ) : (
                  <StatusDot tone="muted" label="Checking…" />
                )}
              </p>

              <h3 className="mt-6 text-base font-semibold">Explore the implementation</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {[
                  ['GitHub repository', LINKS.repo],
                  ['README', LINKS.readme],
                  ['Invariant proofs', LINKS.invariants],
                  ['Refusal codes', LINKS.refusals],
                  ['Design decisions', LINKS.decisions],
                ].map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="text-accent-text underline underline-offset-2"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-console flex-wrap items-center gap-4 px-4 py-7 text-xs text-muted sm:px-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            ← Back to live demo
          </button>
          <p className="ml-auto">
            Demo credits only. No real money, no payment provider, no custody.
          </p>
        </div>
      </footer>
    </div>
  );
};
