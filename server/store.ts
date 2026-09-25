import type { Transfer, Receipt, SignedCommand } from "../shared/protocol";
import type { Round } from "../shared/game";
export type Account = {
  id: string;
  token: string;
  name: string;
  publicKey: JsonWebKey;
  balance: number;
  nonce: number;
  session: { limit: number; spent: number; expiresAt: number };
  transfers: Transfer[];
};
export type Table = {
  id: string;
  name: string;
  subtitle: string;
  theme: string;
  min: number;
  max: number;
  private: boolean;
  seats: (string | null)[];
  seed: string;
  commitment: string;
  round: Round | null;
  bets: Record<
    string,
    { bet: number; entropy: string; envelope: SignedCommand }
  >;
  actions: Receipt["actions"];
  deadline: number | null;
  betDeadline: number | null;
  sequence: number;
  settled: boolean;
  receipts: Receipt[];
  reaction?: { id: string; name: string; text: string; at: number };
};
export type Store = {
  version: 1;
  accounts: Record<string, Account>;
  tables: Record<string, Table>;
  house: number;
  initialSupply: number;
  presence: Record<string, { tableId: string; at: number }>;
};
