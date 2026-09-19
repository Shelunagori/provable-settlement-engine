export type Health = {
  ok: boolean;
  db: boolean;
  migrations: string[];
  uptimeSeconds: number;
  /** Optional facilities this deployment has. Absent on an unhealthy answer. */
  features?: { demoReset: boolean };
};
export type Me = { userId: string; balanceMinor: number; dailyNetMinor: number };

export type AccountBalance = { accountId: string; kind: string; balanceMinor: number };
export type Posting = { account: string; amountMinor: number };
export type JournalEntry = {
  id: number;
  kind: string;
  ref: { type: string | null; id: string | null };
  createdAt: string;
  postings: Posting[];
  sum: number;
};
export type Invariants = {
  sumIsZero: boolean;
  totalPostings: number;
  lastEntryId: number;
  totalAmountMinor: number;
  unbalancedEntries: number;
  checkedAt: string;
};

export type WebhookResult =
  | { posted: true; entryId: number }
  | { posted: false; deduplicated: true; entryId: number };
export type StormResult = {
  sent: number;
  posted: number;
  deduplicated: number;
  failed: number;
  httpDeliveries: number;
  entryId: number | null;
  distinctEntryIds: number;
  eventId: string;
};

export type PlacedBet = {
  bet: {
    id: string;
    roundId: string;
    amountMinor: number;
    targetUnder: number;
    clientSeed: string;
  };
  roll: number;
  won: boolean;
  payoutMinor: number;
  entryIds: [number, number];
  seedHash: string;
  nonce: number;
};
export type BetRow = {
  id: string;
  roundId: string;
  userId: string;
  amountMinor: number;
  targetUnder: number;
  clientSeed: string;
  seedHash: string | null;
  nonce: number | null;
  roll: number | null;
  won: boolean | null;
  payoutMinor: number | null;
  createdAt: string;
};

export type Commitment = { seedHash: string; nonce: number };
export type RevealedSeed = { seed: string; seedHash: string; revealedAt: string };
export type RotateResult = {
  revealed: { seed: string; seedHash: string };
  next: { seedHash: string };
};

export type RefusalRow = {
  code: string;
  httpStatus: number;
  summary: string;
  enforcedIn: string;
};
export type RefusalBody = {
  refused: true;
  code: string;
  message: string;
  [key: string]: unknown;
};
export type Affiliate = { earnedMinor: number; referred: string[] };

export type DemoReset = {
  reset: true;
  commitment: { seedHash: string; nonce: number };
  clearedTables: string[];
};
