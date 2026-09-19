import { useEffect, useRef, useState } from 'react';
import { Empty, ErrorState, Loading, Panel } from './Panel.tsx';
import { formatMinor, formatSignedMinor, formatTime } from '../format.ts';
import type { AccountBalance, Affiliate, JournalEntry } from '../types.ts';

const KIND_TONE: Record<string, string> = {
  deposit: 'text-accent',
  bet_lock: 'text-pending',
  round_resolved: 'text-fairness',
  bet_settle: 'text-accent',
  commission: 'text-fairness',
  withdrawal: 'text-muted',
};

const EntryRow = ({ entry, isNew }: { entry: JournalEntry; isNew: boolean }) => {
  const [open, setOpen] = useState(false);
  const sum = entry.postings.reduce((acc, p) => acc + p.amountMinor, 0);

  return (
    <li className={isNew ? 'animate-row-in border-l-2 border-accent pl-2' : 'border-l-2 border-transparent pl-2'}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-2 py-1.5 text-left"
      >
        <span className="num w-10 shrink-0 text-right text-[11px] text-muted">#{entry.id}</span>
        <span className={`num text-[11px] ${KIND_TONE[entry.kind] ?? 'text-muted'}`}>
          {entry.kind}
        </span>
        <span className="num truncate text-[11px] text-muted">{entry.ref.id ?? '—'}</span>
        <span className="num ml-auto shrink-0 text-[11px] text-muted">
          {formatTime(entry.createdAt)}
        </span>
        <span
          className={`num shrink-0 rounded px-1 text-[10px] ${
            sum === 0 ? 'text-accent' : 'text-refusal'
          }`}
        >
          Σ {sum}
        </span>
      </button>

      {open && (
        <table className="mb-2 w-full text-[11px]">
          <caption className="sr-only">Postings for entry {entry.id}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {entry.postings.map((p, i) => (
              <tr key={`${p.account}-${i}`}>
                <td className="num py-0.5 pl-12 text-muted">{p.account}</td>
                <td
                  className={`num py-0.5 text-right tabular-nums ${
                    p.amountMinor < 0 ? 'text-refusal' : 'text-accent'
                  }`}
                >
                  {formatSignedMinor(p.amountMinor)}
                </td>
              </tr>
            ))}
            {entry.postings.length === 0 && (
              <tr>
                <td colSpan={2} className="py-0.5 pl-12 text-muted">
                  no postings · lifecycle marker
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </li>
  );
};

export const LedgerPanel = ({
  accounts,
  entries,
  affiliate,
  loading,
  error,
  apiBase,
}: {
  accounts: AccountBalance[] | null;
  entries: JournalEntry[] | null;
  affiliate: Affiliate | null;
  loading: boolean;
  error: Error | null;
  apiBase: string;
}) => {
  const seen = useRef<Set<number>>(new Set());
  const [fresh, setFresh] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!entries) return;
    const incoming = entries.map((e) => e.id);
    const isFirstLoad = seen.current.size === 0;
    const added = incoming.filter((id) => !seen.current.has(id));
    incoming.forEach((id) => seen.current.add(id));
    if (!isFirstLoad && added.length > 0) {
      setFresh(new Set(added));
      const t = setTimeout(() => setFresh(new Set()), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [entries]);

  return (
    <Panel label="Ledger" description="Accounts and the journal, newest entry first.">
      {error && <ErrorState error={error} base={apiBase} />}

      {!error && (
        <>
          <table className="w-full text-[11px]">
            <caption className="sr-only">Account balances</caption>
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-1 text-left font-medium">Account</th>
                <th scope="col" className="py-1 text-left font-medium">Kind</th>
                <th scope="col" className="py-1 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {(accounts ?? []).map((a) => (
                <tr key={a.accountId} className="border-b border-line/50 last:border-0">
                  <td className="num py-1">{a.accountId}</td>
                  <td className="py-1 text-muted">{a.kind}</td>
                  <td className="num py-1 text-right tabular-nums">
                    {formatMinor(a.balanceMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {affiliate && (
            <div className="mt-3 rounded border border-line px-3 py-2 text-[11px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="num text-muted">affiliate:alice</span>
                <span className="num tabular-nums">{formatMinor(affiliate.earnedMinor)}</span>
              </div>
              <p className="mt-1 text-muted">
                earned from commission postings · referred{' '}
                <span className="num">{affiliate.referred.join(', ') || '—'}</span>
              </p>
            </div>
          )}

          <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Journal
          </h3>
          {loading && !entries && <Loading what="journal" />}
          {entries && entries.length === 0 && <Empty>Send a deposit to see the first entry.</Empty>}
          {entries && entries.length > 0 && (
            <ul className="mt-1">
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} isNew={fresh.has(e.id)} />
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
};
