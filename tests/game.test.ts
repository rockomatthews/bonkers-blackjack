import test from "node:test";
import assert from "node:assert/strict";
import {
  act,
  allowed,
  hash,
  rank,
  RULES,
  settle,
  shuffle,
  startRound,
  total,
  type Hand,
  type Round,
} from "../shared/game";
const hand = (cards: number[], bet = 1000, split = false): Hand => ({
  cards,
  bet,
  split,
  splitAces: false,
  status: "playing",
});
function fixture(
  cards: number[],
  dealer = [9, 6],
  shoe = [4, 5, 6, 7, 8, 9, 10, 11, 12],
): Round {
  return {
    id: "test",
    rules: RULES,
    dealer,
    players: [
      {
        id: "p",
        name: "Player",
        hands: [hand(cards)],
        committed: 1000,
        payout: 0,
      },
    ],
    shoe,
    cursor: 0,
    phase: "playing",
    current: [0, 0],
  };
}
test("soft and hard ace totals", () => {
  assert.deepEqual(total([0, 0, 8]), { value: 21, soft: true });
  assert.deepEqual(total([0, 9, 9]), { value: 21, soft: false });
  assert.deepEqual(total([0, 5]), { value: 17, soft: true });
});
test("six decks use deterministic, entropy-bound shuffles", () => {
  const a = shuffle("server", ["a", "b"]);
  assert.equal(a.length, 312);
  assert.equal(new Set(a).size, 312);
  assert.deepEqual(a, shuffle("server", ["a", "b"]));
  assert.notDeepEqual(a, shuffle("server", ["b", "a"]));
  assert.notDeepEqual(a, shuffle("server2", ["a", "b"]));
  assert.equal(a.filter((c) => rank(c) === 0).length, 24);
});
test("dealer stands on soft 17", () => {
  const r = fixture([9, 7], [0, 5], [9]);
  act(r, "p", "stand", 0);
  assert.deepEqual(r.dealer, [0, 5]);
  assert.equal(r.players[0].payout, 2000);
});
test("naturals pay 3:2, push against a dealer natural, split 21 is ordinary", () => {
  let r = fixture([0, 9]);
  settle(r);
  assert.equal(r.players[0].payout, 2500);
  r = fixture([0, 9], [0, 12]);
  settle(r);
  assert.equal(r.players[0].payout, 1000);
  r = fixture([0, 9]);
  r.players[0].hands[0].split = true;
  settle(r);
  assert.equal(r.players[0].payout, 2000);
  r = fixture([9, 8], [0, 12]);
  settle(r);
  assert.equal(r.players[0].payout, 0);
});
test("bust, normal win, loss, push and dealer bust", () => {
  for (const [cards, dealer, expected] of [
    [[9, 9, 4], [9, 6], 0],
    [[9, 8], [9, 6], 2000],
    [[9, 5], [9, 6], 0],
    [[9, 6], [9, 6], 1000],
    [[9, 4], [9, 9, 4], 2000],
  ] as [number[], number[], number][]) {
    const r = fixture(cards, dealer);
    settle(r);
    assert.equal(r.players[0].payout, expected);
  }
});
test("double takes one card, reserves additional stake and settles", () => {
  const r = fixture([4, 5], [9, 6], [9]);
  assert.equal(act(r, "p", "double", 1000), 1000);
  assert.equal(r.players[0].committed, 2000);
  assert.equal(r.players[0].hands[0].cards.length, 3);
  assert.equal(r.phase, "settled");
  assert.equal(r.players[0].payout, 4000);
});
test("split aces get one card each and cannot be resplit", () => {
  const r = fixture([0, 13], [9, 6], [0, 9]);
  act(r, "p", "split", 1000);
  assert.equal(r.players[0].hands.length, 2);
  assert.ok(
    r.players[0].hands.every((h) => h.cards.length === 2 && h.splitAces),
  );
  assert.equal(r.phase, "settled");
  assert.equal(r.players[0].hands[1].payout, 2000);
});
test("split cap is four hands; double after split is permitted", () => {
  const r = fixture([7, 20], [9, 6], [7, 7, 7, 7, 7, 7, 2]);
  act(r, "p", "split", 5000);
  assert.ok(allowed(r, "p", 5000).includes("double"));
  act(r, "p", "split", 5000);
  act(r, "p", "split", 5000);
  assert.equal(r.players[0].hands.length, 4);
  assert.ok(!allowed(r, "p", 5000).includes("split"));
});
test("same rank required for splitting, balance and turn checks reject invalid actions", () => {
  const r = fixture([9, 10]);
  assert.ok(!allowed(r, "p", 1000).includes("split"));
  assert.ok(!allowed(r, "p", 0).includes("double"));
  assert.throws(() => act(r, "other", "stand", 1000));
  assert.throws(() => act(r, "p", "split", 1000));
});
test("dealer natural immediately settles all seats", () => {
  let found = false;
  for (let i = 0; i < 200; i++) {
    const r = startRound(
      "id",
      [{ id: "p", name: "p", bet: 1000, entropy: "x" }],
      String(i),
    );
    if (total(r.dealer).value === 21 && r.dealer.length === 2 && !r.insurancePending) {
      assert.equal(r.phase, "settled");
      found = true;
      break;
    }
  }
  assert.ok(found);
});
test("10,000 deterministic hands conserve integer payouts and finish within deck bounds", () => {
  for (let i = 0; i < 10000; i++) {
    const r = startRound(
      String(i),
      Array.from({ length: 7 }, (_, n) => ({
        id: String(n),
        name: String(n),
        bet: 500,
        entropy: hash(String(n)),
      })),
      String(i),
    );
    while (r.current) {
      const p = r.players[r.current[0]],
        h = p.hands[r.current[1]];
      act(r, p.id, r.insurancePending ? "decline-insurance" : total(h.cards).value < 16 ? "hit" : "stand", 100000);
    }
    assert.equal(r.phase, "settled");
    assert.ok(r.cursor <= 312);
    for (const p of r.players) {
      assert.ok(Number.isSafeInteger(p.payout));
      assert.ok(p.payout >= 0 && p.payout <= p.committed * 2.5);
    }
  }
});

test("insurance precedes the peek, hides the hole card, and pays 2:1 plus stake", () => {
  const r = fixture([9, 8], [0, 12]);
  r.insurancePending = true;
  assert.deepEqual(allowed(r,"p",500), ["insurance","decline-insurance","stand"]);
  assert.throws(() => act(r,"p","hit",10000));
  assert.equal(act(r,"p","insurance",500),500);
  assert.equal(r.phase,"settled");
  assert.equal(r.players[0].committed,1500);
  assert.equal(r.players[0].payout,1500);
});
test("insurance loses against a non-natural dealer; cannot buy twice or without funds", () => {
  const r=fixture([9,8],[0,5]); r.insurancePending=true;
  assert.ok(!allowed(r,"p",499).includes("insurance"));
  assert.throws(()=>act(r,"p","insurance",499));
  assert.equal(act(r,"p","insurance",500),500);
  assert.equal(r.phase,"playing");
  assert.throws(()=>act(r,"p","insurance",500));
  act(r,"p","stand",0);
  assert.equal(r.players[0].payout,2000);
  assert.equal(r.players[0].committed,1500);
});
test("every seat, including a natural, gets insurance before peek; decline is free", () => {
  const r=fixture([0,9],[0,12]); r.players[0].hands[0].status="natural";
  r.players.push({id:"q",name:"Second",hands:[hand([9,8])],committed:1000,payout:0});
  r.insurancePending=true;
  act(r,"p","insurance",500);
  assert.equal(r.phase,"playing");
  assert.deepEqual(r.current,[1,0]);
  assert.throws(()=>act(r,"p","insurance",500));
  assert.equal(act(r,"q","decline-insurance",0),0);
  assert.equal(r.players[0].payout-r.players[0].committed,1000);
  assert.equal(r.players[1].payout,0);
});
test("insured natural yields even money when dealer has no blackjack too",()=>{
  const r=fixture([0,9],[0,5]); r.players[0].hands[0].status="natural"; r.insurancePending=true;
  act(r,"p","insurance",500);
  assert.equal(r.phase,"settled");
  assert.equal(r.players[0].payout-r.players[0].committed,1000);
});
test("late surrender returns exactly half, cannot follow a hit or split",()=>{
  const r=fixture([9,5]);
  assert.ok(allowed(r,"p",0).includes("surrender"));
  act(r,"p","surrender",0);
  assert.equal(r.players[0].payout,500);
  assert.equal(r.players[0].hands[0].result,"Surrender");
  const hit=fixture([2,3]); act(hit,"p","hit",0);
  assert.ok(!allowed(hit,"p",1000).includes("surrender"));
  const split=fixture([7,20]); act(split,"p","split",1000);
  assert.ok(!allowed(split,"p",1000).includes("surrender"));
});
test("double after a hit is rejected; a doubled bust loses the doubled stake",()=>{
  const r=fixture([9,5],[9,6],[9]);
  act(r,"p","double",1000);
  assert.equal(r.players[0].payout,0);
  assert.equal(r.players[0].committed,2000);
  const h=fixture([1,2]);act(h,"p","hit",1000);
  assert.ok(!allowed(h,"p",1000).includes("double"));
});
