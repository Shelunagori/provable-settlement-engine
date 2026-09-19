/**
 * Generates docs/REFUSALS.md from api/src/refusals.ts.
 *
 * The code is the contract: GET /refusals serves that object and the tests
 * assert against it. A hand-maintained table beside a hand-maintained code
 * table is two tables that will disagree, and the one people read is the one
 * that will be wrong.
 *
 *   npm run docs:refusals   writes the file
 *   npm run docs:check      fails if the committed file has drifted
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refusalTable } from '../api/src/refusals.js';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'docs', 'REFUSALS.md');

const render = (): string => {
  const rows = refusalTable();
  return `# Refusal table

A refusal is a deliberate, server-side "no" with a stable code, as distinct from
an unexpected error or a malformed request. Every one is enforced where the
decision can be trusted — inside the transaction, under the relevant lock —
never in the client and never in a pre-flight check a later caller could skip.

**This file is generated from [\`api/src/refusals.ts\`](../api/src/refusals.ts).**
Run \`npm run docs:refusals\` after changing the table; \`npm run docs:check\`
fails if it has drifted. The same object is served by \`GET /refusals\` and
asserted by [\`api/test/refusals.test.ts\`](../api/test/refusals.test.ts), so
there is one contract rather than three that can disagree.

Every refusal answers to the same shape:

\`\`\`json
{
  "refused": true,
  "code": "BET_ABOVE_MAX",
  "message": "Bet 60000 exceeds max 50000",
  "limit": 50000
}
\`\`\`

| Code | HTTP | When | Enforced where |
|---|---|---|---|
${rows.map((r) => `| \`${r.code}\` | ${r.httpStatus} | ${r.summary} | ${r.enforcedIn} |`).join('\n')}

\`INVALID_PAYLOAD\`, \`NO_SUCH_ROUND\` and \`INTERNAL_ERROR\` are deliberately not
in this table. They answer a request that never became a business decision.
`;
};

const mode = process.argv[2] ?? 'write';
const generated = render();

if (mode === 'check') {
  const committed = readFileSync(target, 'utf8');
  if (committed !== generated) {
    console.error(
      'docs/REFUSALS.md is out of date with api/src/refusals.ts. Run: npm run docs:refusals',
    );
    process.exit(1);
  }
  console.log('docs/REFUSALS.md matches api/src/refusals.ts');
} else {
  writeFileSync(target, generated);
  console.log(`docs/REFUSALS.md written (${refusalTable().length} codes)`);
}
