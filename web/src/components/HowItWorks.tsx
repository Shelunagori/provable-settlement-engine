import { Card, SectionHeading } from './ui.tsx';

const STEPS = [
  {
    title: 'Money is double-entry',
    body: 'Nothing is added to a balance. A movement is a set of postings across accounts that sums to zero, written in one transaction. The database enforces the zero sum with a deferred constraint trigger, so a hand-written INSERT is rejected exactly like an application bug would be.',
  },
  {
    title: 'A balance is a question, not a column',
    body: 'Asking for a balance sums that account’s postings at read time, inside the same transaction that is about to spend it. Rows are locked in a fixed order so two concurrent requests cannot both believe the money is theirs.',
  },
  {
    title: 'Payments are claimed, not checked',
    body: 'A payment notification is claimed by its event id with an insert that does nothing on conflict. Duplicates lose the race at the unique index rather than being filtered by a prior read, so there is no window between checking and acting.',
  },
  {
    title: 'The outcome is fixed before you play',
    body: 'The server publishes the hash of a secret seed. Your outcome is HMAC-SHA256 of your client seed and a nonce, keyed by that secret. When the seed is retired it is disclosed, and anyone can recompute every outcome it produced — including in a browser, as step 05 does.',
  },
  {
    title: 'Refusals are part of the design',
    body: 'A rejected action returns a named code, an HTTP status and structured detail. The list of codes is generated from the same table the server enforces, so the documentation cannot drift away from the behaviour.',
  },
];

export const HowItWorks = () => (
  <section id="how" className="scroll-mt-24 pt-16">
    <SectionHeading
      eyebrow="How it works"
      title="Five rules the server will not bend"
      lead="The interface is a window onto these rules. It cannot relax any of them, because it never decides anything."
    />
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {STEPS.map((s, i) => (
        <Card key={s.title} className="p-5" raised>
          <p className="mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</p>
          <h3 className="mt-2 text-base font-semibold">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
        </Card>
      ))}
    </div>
  </section>
);
