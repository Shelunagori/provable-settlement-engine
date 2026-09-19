/**
 * A journal entry drawn the way an accountant would sanity-check one: the legs,
 * then the total, then a tick. Used to explain double-entry to someone who has
 * never met it, so the arithmetic has to be visible rather than asserted.
 */
export const Entry = ({
  title,
  legs,
}: {
  title: string;
  legs: { account: string; amount: string }[];
}) => (
  <div className="rounded-lg border border-line bg-subtle px-3 py-2.5">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
    <table className="mt-2 w-full text-sm">
      <caption className="sr-only">{title}: postings and their total</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Account</th>
          <th scope="col">Amount</th>
        </tr>
      </thead>
      <tbody>
        {legs.map((l) => (
          <tr key={l.account}>
            <td className="py-0.5">{l.account}</td>
            <td
              className={`mono py-0.5 text-right ${
                l.amount.startsWith('-') ? 'text-refusal' : 'text-accent-text'
              }`}
            >
              {l.amount}
            </td>
          </tr>
        ))}
        <tr className="border-t border-line">
          <td className="py-1 text-xs text-muted">Total</td>
          <td className="mono py-1 text-right text-xs text-accent-text">0.00 ✓</td>
        </tr>
      </tbody>
    </table>
  </div>
);
