import { FEE_POLICY, LEGACY_FEE_POLICY, roundFee } from "./fees";
import {
  act,
  hash,
  startRound,
  RULES,
  type Move,
  type Round,
  type Wager,
} from "./game";
export type Command = {
  id: string;
  nonce: number;
  tableId: string;
  kind: string;
  payload: Record<string, unknown>;
};
export type SignedCommand = { command: Command; signature: string };
export type Receipt = {
  version: 1 | 2;
  fees?: Record<string, { amount: number; policy: string }>;
  roundId: string;
  tableId: string;
  rules: string;
  commitment: string;
  seed: string;
  wagers: Wager[];
  keys: Record<string, JsonWebKey>;
  bets: Record<string, SignedCommand>;
  actions: {
    actor: string;
    move: Move;
    automatic: boolean;
    envelope?: SignedCommand;
  }[];
  outcome: ReturnType<typeof outcome>;
  hash: string;
};
export function outcome(round: Round) {
  return {
    dealer: round.dealer,
    players: round.players.map((p) => ({
      id: p.id,
      committed: p.committed,
      payout: p.payout,
      hands: p.hands,
    })),
  };
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
      .join(",") +
    "}"
  );
}
export async function verifySignature(
  key: JsonWebKey,
  envelope: SignedCommand,
) {
  try {
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      key,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const bytes = Uint8Array.from(atob(envelope.signature), (c) =>
      c.charCodeAt(0),
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      bytes,
      new TextEncoder().encode(canonical(envelope.command)),
    );
  } catch {
    return false;
  }
}
export async function verifyReceipt(
  receipt: Receipt,
): Promise<{ valid: boolean; detail: string }> {
  try {
    if (![1, 2].includes(receipt.version) || receipt.rules !== RULES)
      throw Error("Unsupported receipt or rules version");
    const { hash: claimed, ...body } = receipt;
    if (hash(canonical(body)) !== claimed) throw Error("Receipt hash mismatch");
    if (hash(receipt.seed) !== receipt.commitment)
      throw Error("Seed does not match commitment");
    const seen = new Set<string>(),
      lastNonce = new Map<string, number>();
    const check = async (actor: string, e: SignedCommand) => {
      if (
        !receipt.keys[actor] ||
        !(await verifySignature(receipt.keys[actor], e))
      )
        throw Error("Invalid action signature");
      if (
        e.command.tableId !== receipt.tableId ||
        seen.has(e.command.id) ||
        (lastNonce.get(actor) ?? -1) >= e.command.nonce
      )
        throw Error("Replayed or out-of-order action");
      seen.add(e.command.id);
      lastNonce.set(actor, e.command.nonce);
    };
    if (receipt.version === 2 && (!receipt.fees || Object.keys(receipt.fees).length !== receipt.wagers.length))
      throw Error("Missing or extra fee records");
    for (const w of receipt.wagers) {
      const e = receipt.bets[w.id];
      if (!e) throw Error("Missing signed wager");
      await check(w.id, e);
      const policy = e.command.payload.feePolicy;
      if (receipt.version === 1) {
        if (policy !== undefined || receipt.fees !== undefined) throw Error("Unexpected legacy fee");
      } else {
        const fee = receipt.fees?.[w.id];
        const expectedPolicy = policy === undefined ? LEGACY_FEE_POLICY : FEE_POLICY;
        if ((policy !== undefined && policy !== FEE_POLICY) ||
            fee?.policy !== expectedPolicy || fee?.amount !== (policy === undefined ? 0 : roundFee(w.bet)))
          throw Error("Fee does not match signed wager");
      }
      if (
        e.command.kind !== "bet" ||
        e.command.payload.bet !== w.bet ||
        e.command.payload.entropy !== w.entropy ||
        e.command.payload.commitment !== receipt.commitment
      )
        throw Error("Wager mismatch");
    }
    const round = startRound(receipt.roundId, receipt.wagers, receipt.seed);
    for (const a of receipt.actions) {
      if (a.automatic) {
        if (a.move !== "stand") throw Error("Invalid timeout action");
      } else {
        if (!a.envelope) throw Error("Missing signature");
        await check(a.actor, a.envelope);
        if (
          a.envelope.command.kind !== a.move ||
          a.envelope.command.payload.roundId !== receipt.roundId
        )
          throw Error("Action mismatch");
      }
      act(round, a.actor, a.move, Number.MAX_SAFE_INTEGER);
    }
    if (
      round.phase !== "settled" ||
      canonical(outcome(round)) !== canonical(receipt.outcome)
    )
      throw Error("Outcome does not replay");
    return {
      valid: true,
      detail:
        "Shuffle, signed wagers, player actions, payouts, and recorded fees reproduce exactly. Server timing and pre-round publication are not independently attested in this demo.",
    };
  } catch (e) {
    return {
      valid: false,
      detail: e instanceof Error ? e.message : "Invalid receipt",
    };
  }
}
export const ASSETS = [
  { symbol: "BTC", network: "Bitcoin", rate: 65000, fee: 1.25 },
  { symbol: "ETH", network: "Ethereum", rate: 3200, fee: 1.25 },
  { symbol: "SOL", network: "Solana", rate: 150, fee: 0.5 },
  { symbol: "USDT", network: "Ethereum", rate: 1, fee: 1.25 },
  { symbol: "USDC", network: "Base", rate: 1, fee: 0 },
] as const;
export type Transfer = {
  id: string;
  kind: "deposit" | "withdrawal";
  symbol: string;
  network: string;
  amount: number;
  credit: number;
  fee: number;
  address: string;
  createdAt: number;
  expiresAt: number;
  status:
    | "awaiting"
    | "confirming"
    | "converting"
    | "completed"
    | "failed"
    | "expired";
  message?: string;
};
