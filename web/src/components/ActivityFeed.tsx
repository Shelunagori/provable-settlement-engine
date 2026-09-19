import { Card, Empty, SectionHeading, Skeleton } from './ui.tsx';
import { accountLabel, entryLabel, formatSignedMinor, relativeTime } from '../format.ts';
import type { JournalEntry } from '../types.ts';

const TONE: Record<string, string> = {
  deposit: 'bg-accent',
  bet_lock: 'bg-pending',
  round_resolved: 'bg-fairness',
  bet_settle: 'bg-accent',
  commission: 'bg-fairness',
  withdrawal: 'bg-muted',
};

/** The journal, read as a stream of events rather than a table of rows. */
export const ActivityFeed = ({
  entries,
  loading,
}: {
  entries: JournalEntry[] | null;
  loading: boolean;
}) => (
  <section id="activity" className="scroll-mt-24 pt-16">
    <SectionHeading
      eyebrow="Activity"
      title="Everything that has moved"
      lead="Each line is a journal entry written by the server. There is no separate activity log to fall out of step with the ledger — this is the ledger."
    />

    <Card className="p-2 sm:p-3">
      {loading && !entries && (
        <div className="space-y-2 p-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {entries && entries.length === 0 && <Empty>Nothing has happened yet.</Empty>}

      {entries && entries.length > 0 && (
        <ul className="divide-y divide-line/60">
          {entries.slice(0, 12).map((e) => {
            const credits = e.postings.filter((p) => p.amountMinor > 0);
            const value = credits.reduce((a, p) => a + p.amountMinor, 0);
            return (
              <li key={e.id} className="flex items-center gap-3 px-2 py-2.5 sm:px-3">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${TONE[e.kind] ?? 'bg-muted'}`}
                  aria-hidden="true"
                />
                <span className="text-sm">{entryLabel(e.kind)}</span>
                <span className="hidden truncate text-xs text-muted sm:inline">
                  {credits.map((p) => accountLabel(p.account)).join(', ') || 'lifecycle marker'}
                </span>
                <span className="mono ml-auto shrink-0 text-sm">
                  {value === 0 ? '—' : formatSignedMinor(value)}
                </span>
                <span className="mono w-10 shrink-0 text-right text-xs text-muted">
                  {relativeTime(e.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  </section>
);
