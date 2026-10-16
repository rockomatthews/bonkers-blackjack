import * as legacy from "../shared/legacy-game";
import { randomBytes, randomUUID, randomInt } from "node:crypto";
import {
  act,
  allowed,
  hash,
  publicRound,
  startRound,
  type Move,
} from "../shared/game";
import {
  ASSETS,
  canonical,
  outcome,
  verifySignature,
  type SignedCommand,
  type Transfer,
  type Receipt,
} from "../shared/protocol";
import { FEE_POLICY, LEGACY_FEE_POLICY, roundFee } from "../shared/fees";
import type { Account, Table, Store } from "./store";
import { chipTotal, validChips } from "../shared/chips";
import { AVATARS, nameError, nameKey, normalizeName, type PublicProfile } from "../shared/profiles";
import { normalizeAvatar, type SaveAvatar } from "./avatars";
export function service(data: Store, saveAvatar?: SaveAvatar) {
  const ACTION_MS = Number(process.env.ACTION_MS ?? 25000),
    BET_MS = Number(process.env.BET_MS ?? 15000);
  const seed = () => randomBytes(32).toString("hex");
  function newTable(
    id: string,
    name: string,
    subtitle: string,
    theme: string,
    min: number,
    max: number,
    privateRoom = false,
  ): Table {
    const s = seed();
    return {
      id,
      name,
      subtitle,
      theme,
      min,
      max,
      private: privateRoom,
      seats: Array(7).fill(null),
      seed: s,
      commitment: hash(s),
      round: null,
      bets: {},
      actions: [],
      deadline: null,
      betDeadline: null,
      sequence: 0,
      settled: false,
      receipts: [],
    };
  }
  if (!Object.keys(data.tables).length) {
    for (const t of [
      newTable(
        "bonkers-room",
        "The Bonkers Room",
        "Good cards. Great company.",
        "red",
        500,
        10000,
      ),
      newTable(
        "midnight-lounge",
        "Midnight Lounge",
        "For the beautifully nocturnal.",
        "midnight",
        2500,
        25000,
      ),
      newTable(
        "high-society",
        "Carnival Club",
        "A whole room of delightful chaos.",
        "gold",
        10000,
        50000,
      ),
    ])
      data.tables[t.id] = t;
  }
  if (data.tables["high-society"]) { data.tables["high-society"].name = "Carnival Club"; data.tables["high-society"].subtitle = "A whole room of delightful chaos."; }
  const fail = (message: string): never => {
    throw Error(message);
  };
  const int = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max
      ? v
      : fail("Invalid amount");
  function accountView(a: Account) {
    return {
      id: a.id,
      name: a.name,
      nameChanged: a.nameChanged ?? false,
      avatar: a.avatar ?? "cosmic",
      avatarId: a.avatarId ?? null,
      balance: a.balance,
      nonce: a.nonce,
      session: a.session,
      transfers: a.transfers,
      activeTable:
        Object.values(data.tables).find((t) => t.seats.includes(a.id))?.id ??
        null,
    };
  }
  function view(t: Table, a: Account | null) {
    return {
      id: t.id,
      name: t.name,
      subtitle: t.subtitle,
      theme: t.theme,
      min: t.min,
      max: t.max,
      private: t.private,
      sequence: t.sequence,
      feePolicy: FEE_POLICY,
      commitment: t.commitment,
      deadline: t.deadline,
      betDeadline: t.betDeadline,
      betNotice: a ? t.betNotices?.[a.id] ?? null : null,
      seats: t.seats.map((id) =>
        id
          ? {
              id,
              name: data.accounts[id].name,
              avatar: data.accounts[id].avatar ?? "cosmic",
              avatarId: data.accounts[id].avatarId ?? null,
              connected: Date.now() - (data.presence[id]?.at ?? 0) < 12000,
              bet: t.bets[id]?.bet ?? 0,
              fee: t.bets[id]?.fee ?? 0,
              chips: (t.bets[id]?.envelope.command.payload.chips ?? t.drafts?.[id]?.envelope.command.payload.chips ?? []) as number[],
              stagedBet: Number(t.drafts?.[id]?.envelope.command.payload.bet ?? 0),
            }
          : null,
      ),
      round: t.round ? publicRound(t.round) : null,
      allowed:
        a && t.round
          ? (t.round.rules === legacy.RULES ? legacy.allowed : allowed)(
              t.round as legacy.Round,
              a.id,
              Math.min(
                a.balance,
                Math.max(0, a.session.limit - a.session.spent),
              ),
            ).filter(move => a.session.expiresAt > Date.now() || move === "stand" || move === "decline-insurance")
          : [],
      spectators: Object.entries(data.presence).filter(
        ([id, p]) =>
          p.tableId === t.id &&
          Date.now() - p.at < 12000 &&
          !t.seats.includes(id),
      ).length,
      reaction: t.reaction ?? null,
      receiptIds: t.receipts.map((r) => r.roundId),
      serverTime: Date.now(),
    };
  }
  function reserved() {
    return Object.values(data.tables).reduce(
      (sum, t) =>
        sum +
        (t.settled
          ? 0
          : Object.values(t.bets).reduce((n, b) => n + b.bet * 16, 0)),
      0,
    );
  }
  function authorize(a: Account, amount: number) {
    if (a.session.expiresAt <= Date.now())
      fail("Authorize a new play session in Account");
    if (a.session.spent + amount > a.session.limit)
      fail("Session spending limit reached");
    if (a.balance < amount) fail("Not enough play money");
  }
  function finish(t: Table) {
    if (!t.round || t.round.phase !== "settled" || t.settled) return;
    for (const p of t.round.players) {
      data.accounts[p.id].balance += p.payout;
      data.house -= p.payout;
    }
    const body: Omit<Receipt, "hash"> = {
      version: Object.values(t.bets).some(b => b.envelope.command.kind === "stage-bet") ? 3 : 2,
      roundId: t.round.id,
      tableId: t.id,
      rules: t.round.rules,
      commitment: t.commitment,
      seed: t.seed,
      wagers: t.round.players.map((p) => ({
        id: p.id,
        name: p.name,
        bet: t.bets[p.id].bet,
        entropy: t.bets[p.id].entropy,
      })),
      keys: Object.fromEntries(
        t.round.players.map((p) => [p.id, data.accounts[p.id].publicKey]),
      ),
      bets: Object.fromEntries(
        Object.entries(t.bets).map(([id, b]) => [id, b.envelope]),
      ),
      fees: Object.fromEntries(Object.entries(t.bets).map(([id, b]) => [id, {
        amount: b.fee ?? 0,
        policy: b.fee === undefined ? LEGACY_FEE_POLICY : FEE_POLICY,
      }])),
      actions: t.actions,
      outcome: outcome(t.round),
    };
    t.receipts.unshift({ ...body, hash: hash(canonical(body)) });
    t.receipts = t.receipts.slice(0, 100);
    t.settled = true;
    t.deadline = null;
  }
  function begin(t: Table) {
    if (t.round) fail("Finish this round first");
    const wagers = t.seats
      .filter((id): id is string => !!id && !!t.bets[id])
      .map((id) => ({
        id,
        name: data.accounts[id].name,
        bet: t.bets[id].bet,
        entropy: t.bets[id].entropy,
      }));
    if (!wagers.length) fail("Place a bet first");
    t.drafts = {};
    t.round = startRound(randomUUID(), wagers, t.seed);
    t.deadline = Date.now() + ACTION_MS;
    t.betDeadline = null;
    finish(t);
  }
  function reset(t: Table) {
    if (!t.settled) fail("Round is still in progress");
    t.seed = seed();
    t.commitment = hash(t.seed);
    t.round = null;
    t.bets = {};
    t.drafts = {};
    t.betNotices = {};
    t.actions = [];
    t.deadline = null;
    t.betDeadline = null;
    t.settled = false;
  }
  function move(t: Table, a: Account, kind: Move, envelope?: SignedCommand) {
    if (!t.round) fail("No active round");
    const round = t.round!,
      current = round.current;
    if (!current || round.players[current[0]].id !== a.id)
      fail("Wait for your turn");
    const extra =
      kind === "double" || kind === "split"
        ? round.players[current![0]].hands[current![1]].bet
        : kind === "insurance" ? round.players[current![0]].hands[0].bet / 2 : 0;
    // Standing remains available after session expiry so funds cannot be stranded.
    if (kind !== "stand" && kind !== "decline-insurance") authorize(a, extra);
    if (round.rules === legacy.RULES) legacy.act(round as legacy.Round, a.id, kind as legacy.Move, a.balance);
    else act(round, a.id, kind, a.balance);
    a.balance -= extra;
    a.session.spent += extra;
    data.house += extra;
    t.actions.push({
      actor: a.id,
      move: kind,
      automatic: !envelope,
      ...(envelope ? { envelope } : {}),
    });
    t.deadline = Date.now() + ACTION_MS;
    finish(t);
  }
  function createTransfer(
    a: Account,
    p: Record<string, unknown>,
    kind: "deposit" | "withdrawal",
  ) {
    const asset = ASSETS.find(
      (x) => x.symbol === p.symbol && x.network === p.network,
    );
    if (!asset) fail("Unsupported asset and network");
    const amount = Number(p.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      fail("Enter a positive amount");
    const gross =
      kind === "deposit"
        ? Math.round(amount * asset!.rate * 100)
        : int(p.amount, 1000, 500000);
    if (gross < 1000 || gross > 500000)
      fail("Demo transfers must be between $10 and $5,000");
    const fee = Math.round(asset!.fee * 100),
      credit = gross - fee;
    if (kind === "withdrawal") {
      if (
        typeof p.address !== "string" ||
        !/^demo:[a-zA-Z0-9-]{3,80}$/.test(p.address)
      )
        fail("Use a demo destination such as demo:my-wallet");
      if (a.balance < gross) fail("Not enough available play money");
      a.balance -= gross;
      data.initialSupply -= gross;
    }
    const id = randomUUID();
    const transfer: Transfer = {
      id,
      kind,
      symbol: asset!.symbol,
      network: asset!.network,
      amount,
      credit,
      fee,
      address:
        kind === "deposit" ? `demo:bonkers-blackjack:${id}` : String(p.address),
      createdAt: Date.now(),
      expiresAt: Date.now() + 120000,
      status: kind === "deposit" ? "awaiting" : "confirming",
    };
    a.transfers.unshift(transfer);
    return transfer;
  }
  function profile(id: string): PublicProfile {
    const a = data.accounts[id];
    if (!a) fail("Profile not found");
    return {id: a.id, name: a.name, avatar: a.avatar ?? "cosmic", avatarId: a.avatarId ?? null, nameChanged: a.nameChanged ?? false};
  }
  function nameAvailability(value: string, ownerId: string) {
    const name = normalizeName(value), reason = nameError(name);
    if (reason) return {available:false, reason, name};
    const taken = Object.values(data.accounts).some(a => a.id !== ownerId && nameKey(a.name) === nameKey(name));
    return {available:!taken, reason:taken ? "That name is already taken." : "Available. Yours if you want it.", name};
  }
  function lockBet(t: Table, a: Account, e: SignedCommand) {
    const p = e.command.payload;
    if (!t.seats.includes(a.id)) fail("Take a seat first");
    if (t.round) fail("Start a new round first");
    if (t.bets[a.id]) fail("Bet already locked");
    const bet = int(p.bet, t.min, t.max);
    if (bet % 100 !== 0) fail("Bet in whole dollars");
    if (p.commitment !== t.commitment) fail("Shuffle changed; please try again");
    if (typeof p.entropy !== "string" || !/^[a-f0-9]{64}$/.test(p.entropy)) fail("Invalid player entropy");
    if (p.feePolicy !== FEE_POLICY) fail("Fee policy changed. Refresh before betting.");
    const fee = roundFee(bet);
    authorize(a, bet + fee);
    if (data.house - reserved() < bet * 16) fail("Table reserves exhausted");
    t.bets[a.id] = {bet, entropy:p.entropy as string, envelope:e, fee};
    a.balance -= bet + fee;
    a.session.spent += bet + fee;
    data.house += bet + fee;
    data.feeRevenue = (data.feeRevenue ?? 0) + fee;
    if (t.drafts) delete t.drafts[a.id];
    t.betDeadline ??= Date.now() + BET_MS;
  }
  function lockDraft(t: Table, a: Account) {
    const draft = t.drafts?.[a.id];
    if (!draft) fail("Add chips first");
    if (draft!.sessionExpiry !== a.session.expiresAt) fail("Your play authorization changed. Add your chips again.");
    lockBet(t, a, draft!.envelope);
  }
  function beginIfReady(t: Table) {
    const seated = t.seats.filter((id): id is string => !!id);
    if (!t.round && seated.length && seated.every(id => !!t.bets[id])) begin(t);
  }
  async function apply(a: Account, e: SignedCommand) {
    const { kind, payload: p, tableId } = e.command,
      t = data.tables[tableId];
    if (kind === "claim-name") {
      if (a.nameChanged) fail("Your one name change has already been used.");
      const result = nameAvailability(String(p.name ?? ""), a.id);
      if (!result.available) fail(result.reason);
      if (nameKey(result.name) === nameKey(a.name)) fail("Choose a different name for your one name change.");
      if (Object.values(data.tables).some(t => t.bets[a.id] && !t.settled))
        fail("Finish your current round before choosing your name.");
      a.name = result.name;
      a.nameChanged = true;
      return profile(a.id);
    }
    if (kind === "set-avatar") {
      if (!AVATARS.some(v => v.id === p.avatar)) fail("Unknown avatar");
      a.avatar = String(p.avatar);
      delete a.avatarId;
      return profile(a.id);
    }
    if (kind === "upload-avatar") {
      if (!saveAvatar) fail("Image uploads are not available.");
      const bytes = await normalizeAvatar(p.image);
      const id = randomUUID();
      await saveAvatar!(a.id, id, bytes);
      a.avatarId = id;
      return profile(a.id);
    }
    if (kind === "authorize") {
      const limit = int(p.limit, 100, 5000000);
      a.session = { limit, spent: 0, expiresAt: Date.now() + 3600000 };
      return;
    }
    if (kind === "revoke") {
      a.session.expiresAt = 0;
      for (const table of Object.values(data.tables)) {
        if (table.drafts?.[a.id]) { delete table.drafts[a.id]; (table.betNotices ??= {})[a.id] = "Staged chips cleared: play authorization revoked."; }
      }
      return;
    }
    if (kind === "deposit" || kind === "withdrawal")
      return createTransfer(a, p, kind);
    if (kind === "simulate" || kind === "fail-transfer") {
      const transfer = a.transfers.find((x) => x.id === p.id);
      if (!transfer) fail("Transfer not found");
      if (["completed", "failed", "expired"].includes(transfer!.status))
        fail("Transfer is already final");
      if (kind === "fail-transfer") {
        if (transfer!.kind === "withdrawal") {
          const gross = transfer!.credit + transfer!.fee;
          a.balance += gross;
          data.initialSupply += gross;
        }
        transfer!.status = "failed";
        transfer!.message = "Simulated route failure. No funds lost.";
      } else {
        if (transfer!.status !== "awaiting")
          fail("Transfer already processing");
        if (transfer!.expiresAt <= Date.now()) fail("Quote expired");
        transfer!.status = "confirming";
        transfer!.createdAt = Date.now();
      }
      return;
    }
    if (kind === "create-table") {
      const name = String(p.name ?? "").trim();
      if (name.length < 3 || name.length > 40)
        fail("Room name must be 3–40 characters");
      if (Object.values(data.tables).filter((t) => t.private).length >= 100)
        fail("Demo room limit reached");
      const id = "private-" + randomBytes(12).toString("hex");
      data.tables[id] = newTable(
        id,
        name,
        "Your people. Your table.",
        "red",
        500,
        10000,
        true,
      );
      return { tableId: id };
    }
    if (!t) fail("Table not found");
    if (kind === "seat") {
      const index = int(p.index, 0, 6);
      if (t.seats[index]) fail("That seat is taken");
      if (Object.values(data.tables).some((x) => x.seats.includes(a.id)))
        fail("Leave your current seat first");
      t.seats[index] = a.id;
    } else if (kind === "leave") {
      if (t.bets[a.id] && !t.settled)
        fail("Your seat is locked until the round settles");
      t.seats = t.seats.map((id) => (id === a.id ? null : id));
      if (t.drafts) delete t.drafts[a.id];
      beginIfReady(t);
    } else if (kind === "stage-bet") {
      if (!t.seats.includes(a.id)) fail("Take a seat first");
      if (t.round || t.bets[a.id]) fail("Betting is closed for your seat");
      if (!validChips(p.chips)) fail("Invalid chip stack");
      const bet = int(p.bet, 0, t.max);
      if (chipTotal(p.chips as number[]) !== bet) fail("Chip total does not match wager");
      if (p.commitment !== t.commitment) fail("Shuffle changed; please try again");
      if (p.feePolicy !== FEE_POLICY || p.lockOnDeadline !== true) fail("Authorize the fee and automatic lock at the deadline");
      if (typeof p.entropy !== "string" || !/^[a-f0-9]{64}$/.test(p.entropy)) fail("Invalid player entropy");
      if (bet) authorize(a, bet + roundFee(bet));
      t.drafts ??= {};
      t.betNotices ??= {};
      delete t.betNotices[a.id];
      if (bet) {
        t.drafts[a.id] = {envelope:e, sessionExpiry:a.session.expiresAt};
        t.betDeadline ??= Date.now() + BET_MS;
      } else delete t.drafts[a.id];
      if (!Object.keys(t.drafts).length && !Object.keys(t.bets).length) t.betDeadline = null;
    } else if (kind === "bet") {
      // Legacy signed clients may still lock a wager directly.
      lockBet(t, a, e);
    } else if (kind === "deal") {
      if (!t.bets[a.id]) lockDraft(t, a);
      beginIfReady(t);
    } else if (kind === "next") {
      if (!t.seats.includes(a.id)) fail("Take a seat first");
      reset(t);
    } else if (["hit", "stand", "double", "split", "insurance", "decline-insurance", "surrender"].includes(kind)) {
      if (p.roundId !== t.round?.id)
        fail("This action belongs to a different round");
      move(t, a, kind as Move, e);
    } else if (kind === "reaction") {
      if (
        !["Nice hand", "Good luck", "Well played", "♠"].includes(
          String(p.reaction),
        )
      )
        fail("Unknown reaction");
      t.reaction = {
        id: randomUUID(),
        name: a.name,
        text: String(p.reaction),
        at: Date.now(),
      };
    } else fail("Unknown command");
    t.sequence++;
  }

  function tick() {
    const now = Date.now();
    for (const t of Object.values(data.tables)) {
      if (!t.round && t.betDeadline && now >= t.betDeadline) {
        for (const id of t.seats) {
          if (!id || !t.drafts?.[id] || t.bets[id]) continue;
          try { lockDraft(t, data.accounts[id]); }
          catch (error) {
            (t.betNotices ??= {})[id] = "Wager not placed: " + (error instanceof Error ? error.message : "Please add chips again.");
            delete t.drafts[id];
          }
        }
        t.betDeadline = null;
        if (Object.keys(t.bets).length) begin(t);
        t.sequence++;
      }
      if (t.round?.phase === "playing" && t.deadline && now >= t.deadline) {
        const id = t.round.players[t.round.current![0]].id;
        move(t, data.accounts[id], t.round.insurancePending ? "decline-insurance" : "stand");
        t.sequence++;
      }
    }
    for (const a of Object.values(data.accounts))
      for (const transfer of a.transfers) {
        if (transfer.status === "awaiting" && now >= transfer.expiresAt)
          transfer.status = "expired";
        else if (
          transfer.status === "confirming" &&
          now - transfer.createdAt > 2000
        )
          transfer.status = "converting";
        else if (
          transfer.status === "converting" &&
          now - transfer.createdAt > 4500
        ) {
          transfer.status = "completed";
          if (transfer.kind === "deposit") {
            a.balance += transfer.credit;
            data.initialSupply += transfer.credit;
          }
        }
      }
    for (const [id, p] of Object.entries(data.presence))
      if (now - p.at > 60000) delete data.presence[id];
  }
  async function command(a: Account, e: SignedCommand) {
    if (!e?.command || typeof e.signature !== "string")
      fail("A signed command is required");
    const c = e.command;
    if (
      typeof c.id !== "string" ||
      c.id.length > 80 ||
      typeof c.tableId !== "string" ||
      !c.payload ||
      typeof c.payload !== "object" ||
      Array.isArray(c.payload)
    )
      fail("Invalid command");
    if (c.nonce !== a.nonce) fail("Stale command. Refresh and try again.");
    if (!(await verifySignature(a.publicKey, e)))
      fail("Invalid command signature");
    const result = await apply(a, e);
    a.nonce++;
    return { account: accountView(a), result };
  }
  async function login(p: Record<string, unknown>) {
    // Names are always assigned by the server; signup cannot bypass the claim.
    const adjectives = ["Cosmic", "Disco", "Lucky", "Lunar", "Wild", "Turbo", "Sneaky", "Velvet"];
    const nouns = ["Goblin", "Raccoon", "Pickle", "Comet", "Walrus", "Waffle", "Gecko", "Noodle"];
    let name: string;
    do { name = adjectives[randomInt(adjectives.length)] + nouns[randomInt(nouns.length)] + "_" + randomBytes(3).toString("hex"); }
    while (Object.values(data.accounts).some(a => nameKey(a.name) === nameKey(name)));
    if (Object.keys(data.accounts).length >= 1000)
      fail("Demo account capacity reached");
    const publicKey = p.publicKey as JsonWebKey;
    if (publicKey?.d) fail("Do not submit a private key");
    await crypto.subtle.importKey(
      "jwk",
      publicKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const id = randomUUID(),
      token = seed();
    const a: Account = {
      id,
      token,
      name,
      publicKey,
      nameChanged: false,
      avatar: AVATARS[randomInt(AVATARS.length)].id,
      balance: 100000,
      nonce: 0,
      session: { limit: 0, spent: 0, expiresAt: 0 },
      transfers: [],
    };
    data.accounts[id] = a;
    data.initialSupply += 100000;
    return { token, account: accountView(a) };
  }
  const auth = (token: string | null) =>
    Object.values(data.accounts).find((a) => a.token === token) ??
    fail("Sign in to continue");
  return { tick, command, login, auth, accountView, view, reserved, profile, nameAvailability };
}
