import { Card, Empty, SectionHeading, Skeleton } from './ui.tsx';
import { accountLabel, entryLabel, formatSignedMinor, relativeTime } from '../format.ts';
import type { JournalEntry } from '../types.ts';

const TONE: Record<string, string> = {
  deposit: 'bg-accent-vivid',
  bet_lock: 'bg-pending-vivid',
  round_resolved: 'bg-fairness-vivid',
  bet_settle: 'bg-accent-vivid',
  commission: 'bg-fairness-vivid',
  withdrawal: 'bg-muted',
};

/** The journal read as a stream of events. The raw kind stays on line two. */
export const ActivityFeed = ({
  entries,
  loading,
}: {
  entries: JournalEntry[] | null;
  loading: boolean;
}) => (
  <section id="activity" className="scroll-mt-20 pt-14">
    <SectionHeading
      eyebrow="Activity"
      title="Everything that has moved"
      lead="Each line is a journal entry written by the server. This is the ledger itself, not a log beside it."
    />

    <Card className="p-2 sm:p-3">
      {loading && !entries && (
        <div className="space-y-2 p-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      )}

      {entries && entries.length === 0 && <Empty>Nothing has happened yet.</Empty>}

      {entries && entries.length > 0 && (
        <ul className="divide-y divide-line">
          {entries.slice(0, 12).map((e) => {
            const credits = e.postings.filter((p) => p.amountMinor > 0);
            const value = credits.reduce((a, p) => a + p.amountMinor, 0);
            return (
              <li key={e.id} className="flex items-center gap-3 px-2 py-2.5 sm:px-3">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${TONE[e.kind] ?? 'bg-muted'}`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm">{entryLabel(e.kind)}</p>
                  <p className="mono truncate text-[11px] text-muted">
                    {e.kind} · entry #{e.id}
                    {credits.length > 0 && ` · ${credits.map((p) => accountLabel(p.account)).join(', ')}`}
                  </p>
                </div>
                <div className="ml-auto shrink-0 text-right">
                  <p className="num text-sm">{value === 0 ? '—' : formatSignedMinor(value)}</p>
                  <p className="mono text-[11px] text-muted">
                    {relativeTime(e.createdAt) === 'now' ? 'just now' : `${relativeTime(e.createdAt)} ago`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  </section>
);
