import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export const RULES = "bonkers-sixdeck-s17-insurance-surrender-v2";
export const hash = (value: string) =>
  bytesToHex(sha256(new TextEncoder().encode(value)));
export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const rank = (card: number) => card % 13;
export const cardLabel = (card: number) =>
  ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][
    rank(card)
  ];
export const suit = (card: number) =>
  ["♠", "♥", "♣", "♦"][Math.floor((card % 52) / 13)];
export function total(cards: number[]) {
  let value = cards.reduce(
    (sum, card) => sum + (rank(card) === 0 ? 11 : Math.min(rank(card) + 1, 10)),
    0,
  );
  let aces = cards.filter((card) => rank(card) === 0).length;
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return { value, soft: aces > 0 };
}
export function shuffle(seed: string, entropy: string[]) {
  const deck = Array.from({ length: 312 }, (_, i) => i);
  let counter = 0;
  for (let i = deck.length - 1; i > 0; i--) {
    const bound = i + 1,
      limit = Math.floor(0x100000000 / bound) * bound;
    let sample: number;
    do {
      sample = parseInt(
        hash(JSON.stringify([RULES, seed, entropy, counter++])).slice(0, 8),
        16,
      );
    } while (sample >= limit);
    const j = sample % bound;
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
export type Move = "hit" | "stand" | "double" | "split" | "insurance" | "decline-insurance" | "surrender";
export type Hand = {
  cards: number[];
  bet: number;
  status: "playing" | "stood" | "bust" | "natural" | "surrendered";
  split: boolean;
  splitAces: boolean;
  payout?: number;
  result?: string;
};
export type PlayerRound = {
  id: string;
  name: string;
  hands: Hand[];
  committed: number;
  payout: number;
  insurance?: number;
  insuranceDecided?: boolean;
};
export type Round = {
  id: string;
  rules: string;
  dealer: number[];
  players: PlayerRound[];
  shoe: number[];
  cursor: number;
  phase: "playing" | "settled";
  current: [number, number] | null;
  insurancePending?: boolean;
};
export type Wager = { id: string; name: string; bet: number; entropy: string };
function draw(round: Round) {
  const card = round.shoe[round.cursor++];
  if (card === undefined) throw Error("Shoe exhausted");
  return card;
}
export function startRound(id: string, wagers: Wager[], seed: string): Round {
  if (
    !wagers.length ||
    wagers.length > 7 ||
    new Set(wagers.map((p) => p.id)).size !== wagers.length
  )
    throw Error("Invalid player count");
  if (
    wagers.some(
      (w) => !Number.isSafeInteger(w.bet) || w.bet < 100 || w.bet % 100 !== 0,
    )
  )
    throw Error("Invalid bet");
  const round: Round = {
    id,
    rules: RULES,
    dealer: [],
    players: wagers.map((w) => ({
      id: w.id,
      name: w.name,
      hands: [
        {
          cards: [],
          bet: w.bet,
          status: "playing",
          split: false,
          splitAces: false,
        },
      ],
      committed: w.bet,
      payout: 0,
    })),
    shoe: shuffle(
      seed,
      wagers.map((w) => w.entropy),
    ),
    cursor: 0,
    phase: "playing",
    current: null,
  };
  for (let pass = 0; pass < 2; pass++) {
    for (const player of round.players) player.hands[0].cards.push(draw(round));
    round.dealer.push(draw(round));
  }
  for (const player of round.players)
    if (total(player.hands[0].cards).value === 21)
      player.hands[0].status = "natural";
  if (rank(round.dealer[0]) === 0) {
    round.insurancePending = true;
    round.current = [0, 0];
  }
  else if (total(round.dealer).value === 21) settle(round);
  else advance(round);
  return round;
}
export function allowed(round: Round, id: string, balance: number): Move[] {
  if (round.phase !== "playing" || !round.current) return [];
  const [pi, hi] = round.current,
    player = round.players[pi],
    hand = player.hands[hi];
  if (player.id !== id) return [];
  if (round.insurancePending) {
    return balance >= player.hands[0].bet / 2
      ? ["insurance", "decline-insurance", "stand"]
      : ["decline-insurance", "stand"];
  }
  const result: Move[] = ["hit", "stand"];
  if (hand.cards.length === 2 && !hand.split) result.push("surrender");
  if (hand.cards.length === 2 && balance >= hand.bet && !hand.splitAces) {
    result.push("double");
    if (rank(hand.cards[0]) === rank(hand.cards[1]) && player.hands.length < 4)
      result.push("split");
  }
  return result;
}
export function act(
  round: Round,
  id: string,
  move: Move,
  balance: number,
): number {
  if (!allowed(round, id, balance).includes(move))
    throw Error("Action is not available");
  const [pi, hi] = round.current!,
    player = round.players[pi],
    hand = player.hands[hi];
  if (round.insurancePending) {
    const stake = move === "insurance" ? hand.bet / 2 : 0;
    player.insurance = stake;
    player.insuranceDecided = true;
    player.committed += stake;
    const next = round.players.findIndex(p => !p.insuranceDecided);
    if (next >= 0) round.current = [next, 0];
    else {
      round.insurancePending = false;
      if (total(round.dealer).value === 21) settle(round);
      else advance(round);
    }
    return stake;
  }
  let extra = 0;
  if (move === "surrender") hand.status = "surrendered";
  if (move === "stand") hand.status = "stood";
  if (move === "hit" || move === "double") {
    if (move === "double") {
      extra = hand.bet;
      hand.bet *= 2;
    }
    hand.cards.push(draw(round));
    const value = total(hand.cards).value;
    if (value > 21) hand.status = "bust";
    else if (value === 21 || move === "double") hand.status = "stood";
  }
  if (move === "split") {
    extra = hand.bet;
    const second = hand.cards.pop()!;
    hand.split = true;
    hand.splitAces = rank(second) === 0;
    hand.cards.push(draw(round));
    const other: Hand = {
      cards: [second, draw(round)],
      bet: hand.bet,
      status: "playing",
      split: true,
      splitAces: hand.splitAces,
    };
    if (hand.splitAces) {
      hand.status = "stood";
      other.status = "stood";
    } else {
      if (total(hand.cards).value === 21) hand.status = "stood";
      if (total(other.cards).value === 21) other.status = "stood";
    }
    player.hands.splice(hi + 1, 0, other);
  }
  player.committed += extra;
  advance(round);
  return extra;
}
function advance(round: Round) {
  for (let pi = 0; pi < round.players.length; pi++)
    for (let hi = 0; hi < round.players[pi].hands.length; hi++)
      if (round.players[pi].hands[hi].status === "playing") {
        round.current = [pi, hi];
        return;
      }
  const needDealer = round.players.some((p) =>
    p.hands.some((h) => h.status === "stood"),
  );
  if (needDealer)
    while (total(round.dealer).value < 17) round.dealer.push(draw(round));
  settle(round);
}
export function settle(round: Round) {
  const dealer = total(round.dealer).value,
    dealerNatural = round.dealer.length === 2 && dealer === 21;
  for (const player of round.players) {
    player.payout = dealerNatural ? (player.insurance ?? 0) * 3 : 0;
    for (const hand of player.hands) {
      const value = total(hand.cards).value,
        natural = !hand.split && hand.cards.length === 2 && value === 21;
      let payout = 0,
        result = "Dealer wins";
      if (hand.status === "surrendered" && !dealerNatural) {
        payout = hand.bet / 2;
        result = "Surrender";
      }
      else if (value > 21) result = "Bust";
      else if (dealerNatural) {
        if (natural) {
          payout = hand.bet;
          result = "Push";
        }
      } else if (natural) {
        payout = hand.bet * 2.5;
        result = "Blackjack";
      } else if (dealer > 21 || value > dealer) {
        payout = hand.bet * 2;
        result = "You win";
      } else if (value === dealer) {
        payout = hand.bet;
        result = "Push";
      }
      hand.payout = payout;
      hand.result = result;
      player.payout += payout;
    }
  }
  round.phase = "settled";
  round.current = null;
}
export function publicRound(round: Round) {
  const { shoe, cursor, ...safe } = structuredClone(round);
  if (round.phase !== "settled")
    safe.dealer = safe.dealer.map((c, i) => (i === 1 ? -1 : c));
  return safe;
}
