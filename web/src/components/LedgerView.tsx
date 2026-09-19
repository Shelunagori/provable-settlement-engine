import { useEffect, useRef, useState } from 'react';
import { Empty, ErrorState, Loading } from './ui.tsx';
import { accountLabel, entryLabel, formatMinor, formatSignedMinor, formatTime } from '../format.ts';
import type { AccountBalance, JournalEntry } from '../types.ts';

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
    <li
      className={
        isNew
          ? 'animate-rise border-l-2 border-accent pl-3'
          : 'border-l-2 border-transparent pl-3'
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-3 py-2 text-left"
      >
        <span className="mono w-10 shrink-0 text-right text-xs text-muted">#{entry.id}</span>
        <span className={`text-sm ${KIND_TONE[entry.kind] ?? 'text-muted'}`}>
          {entryLabel(entry.kind)}
        </span>
        <span className="mono hidden min-w-0 flex-1 truncate text-xs text-muted sm:block">
          {entry.ref.id ?? '—'}
        </span>
        <span className="mono ml-auto shrink-0 text-xs text-muted">
          {formatTime(entry.createdAt)}
        </span>
        <span className={`mono shrink-0 text-xs ${sum === 0 ? 'text-accent' : 'text-refusal'}`}>
          Σ {sum}
        </span>
      </button>

      {open && (
        <table className="mb-2 w-full text-xs">
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
                <td className="py-0.5 pl-12 text-muted">
                  {accountLabel(p.account)} <span className="mono">({p.account})</span>
                </td>
                <td
                  className={`mono py-0.5 text-right ${
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

export const LedgerView = ({
  accounts,
  entries,
  loading,
  error,
  apiBase,
}: {
  accounts: AccountBalance[] | null;
  entries: JournalEntry[] | null;
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

  if (error) return <ErrorState error={error} base={apiBase} />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">Accounts</h3>
        <p className="mt-1 text-xs text-muted">Each balance is summed from postings at read time.</p>
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">Account balances</caption>
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 text-left text-xs font-medium">Account</th>
              <th scope="col" className="py-2 text-left text-xs font-medium">Kind</th>
              <th scope="col" className="py-2 text-right text-xs font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {(accounts ?? []).map((a) => (
              <tr key={a.accountId} className="border-b border-line/50 last:border-0">
                <td className="py-2">
                  <span className="block">{accountLabel(a.accountId)}</span>
                  <span className="mono text-xs text-muted">{a.accountId}</span>
                </td>
                <td className="py-2 text-xs text-muted">{a.kind}</td>
                <td className="mono py-2 text-right">{formatMinor(a.balanceMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="min-w-0">
        <h3 className="text-sm font-semibold">Journal</h3>
        <p className="mt-1 text-xs text-muted">Newest first. Open an entry to see its postings.</p>
        {loading && !entries && <Loading what="the journal" />}
        {entries && entries.length === 0 && <Empty>Add funds to write the first entry.</Empty>}
        {entries && entries.length > 0 && (
          <ul className="mt-2 max-h-[28rem] overflow-y-auto pr-1">
            {entries.map((e) => (
              <EntryRow key={e.id} entry={e} isNew={fresh.has(e.id)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
