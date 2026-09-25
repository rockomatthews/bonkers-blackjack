import type { Round, Move } from "../shared/game";
import type { Transfer } from "../shared/protocol";
export type Account = {
  id: string;
  name: string;
  balance: number;
  nonce: number;
  activeTable: string | null;
  session: { limit: number; spent: number; expiresAt: number };
  transfers: Transfer[];
};
export type Identity = {
  token: string;
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
};
export type TableView = {
  id: string;
  name: string;
  subtitle: string;
  theme: string;
  min: number;
  max: number;
  private: boolean;
  sequence: number;
  commitment: string;
  deadline: number | null;
  betDeadline: number | null;
  seats: ({
    id: string;
    name: string;
    connected: boolean;
    bet: number;
  } | null)[];
  round: Omit<Round, "shoe" | "cursor"> | null;
  allowed: Move[];
  spectators: number;
  receiptIds: string[];
  reaction: { id: string; name: string; text: string; at: number } | null;
  serverTime: number;
};
