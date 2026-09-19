import { useState } from 'react';
import type { RefusalRow } from '../types.ts';

export const RefusalTable = ({ rows }: { rows: RefusalRow[] }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Refusal table · {rows.length} codes
        </span>
        <span className="num text-xs text-muted" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[34rem] text-left text-[11px]">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="px-3 py-2 font-medium">Code</th>
                <th scope="col" className="px-3 py-2 font-medium">HTTP</th>
                <th scope="col" className="px-3 py-2 font-medium">When</th>
                <th scope="col" className="px-3 py-2 font-medium">Enforced where</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b border-line/60 align-top last:border-0">
                  <td className="num px-3 py-2 text-refusal">{r.code}</td>
                  <td className="num px-3 py-2 text-muted">{r.httpStatus}</td>
                  <td className="px-3 py-2">{r.summary}</td>
                  <td className="px-3 py-2 text-muted">{r.enforcedIn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
