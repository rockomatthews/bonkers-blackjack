import * as legacy from "../shared/legacy-game";
import { FEE_POLICY, roundFee } from "../shared/fees";
import test from "node:test";
import assert from "node:assert/strict";
import { service } from "../server/service";
import { emptyStore } from "../server/database";
import {
  canonical,
  verifyReceipt,
  type Command,
  type SignedCommand,
} from "../shared/protocol";
import { hash, startRound, allowed } from "../shared/game";
import type { Account, Store } from "../server/store";
async function player(data: Store, name: string) {
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const login = await service(data).login({
    name,
    publicKey: await crypto.subtle.exportKey("jwk", keys.publicKey),
  });
  const account = data.accounts[login.account.id];
  const envelope = async (
    kind: string,
    payload: Record<string, unknown> = {},
    tableId = "bonkers-room",
  ): Promise<SignedCommand> => {
    const command: Command = {
      id: crypto.randomUUID(),
      nonce: account.nonce,
      tableId,
      kind,
      payload: ["bet", "stage-bet"].includes(kind) ? {feePolicy: FEE_POLICY, ...payload} : payload,
    };
    return {
      command,
      signature: Buffer.from(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keys.privateKey,
          new TextEncoder().encode(canonical(command)),
        ),
      ).toString("base64"),
    };
  };
  const send = async (
    kind: string,
    payload: Record<string, unknown> = {},
    tableId = "bonkers-room",
  ) => service(data).command(account, await envelope(kind, payload, tableId));
  await send("authorize", { limit: 100000 });
  return { account, envelope, send, keys };
}
const conserved = (d: Store) =>
  assert.equal(
    Object.values(d.accounts).reduce((s, a) => s + a.balance, 0) + d.house,
    d.initialSupply,
  );
test("seven independent signed players finish a shared round and replay exact receipt", async () => {
  const data = emptyStore(),
    players = [];
  for (let i = 0; i < 7; i++) {
    const p = await player(data, "Player " + i);
    players.push(p);
    await p.send("seat", { index: i });
    await p.send("bet", {
      bet: 2500,
      entropy: hash("entropy" + i),
      commitment: data.tables["bonkers-room"].commitment,
    });
  }
  await players[0].send("deal");
  let r = data.tables["bonkers-room"].round!;
  // A fresh service instance models a different Vercel request/server process.
  const hidden = service(data).view(data.tables["bonkers-room"], null).round;
  if (r.phase === "playing") assert.equal(hidden?.dealer[1], -1);
  assert.ok(!("shoe" in hidden!));
  assert.ok(!("seed" in service(data).view(data.tables["bonkers-room"], null)));
  while (r.current) {
    const id = r.players[r.current[0]].id;
    await players
      .find((p) => p.account.id === id)!
      .send("stand", { roundId: r.id });
  }
  const receipt = data.tables["bonkers-room"].receipts[0];
  assert.ok(receipt);
  assert.equal((await verifyReceipt(receipt)).valid, true);
  conserved(data);
  const altered = structuredClone(receipt);
  altered.outcome.players[0].payout += 100;
  assert.equal((await verifyReceipt(altered)).valid, false);
  const badSeed = structuredClone(receipt);
  badSeed.seed = "forged";
  const { hash: _, ...body } = badSeed;
  badSeed.hash = hash(canonical(body));
  assert.equal((await verifyReceipt(badSeed)).valid, false);
  const forged = structuredClone(receipt);
  forged.bets[forged.wagers[0].id].signature = "AAAA";
  const { hash: __, ...fbody } = forged;
  forged.hash = hash(canonical(fbody));
  assert.equal((await verifyReceipt(forged)).valid, false);
  const before = data.house;
  service(data).tick();
  service(data).tick();
  assert.equal(data.house, before);
  conserved(data);
});
test("replay, forged commands, expired sessions, wrong commitment, oversized wagers and insufficient reserves rejected", async () => {
  const data = emptyStore(),
    p = await player(data, "Alice");
  const e = await p.envelope("seat", { index: 0 });
  await service(data).command(p.account, e);
  await assert.rejects(() => service(data).command(p.account, e), /Stale/);
  const forged = await p.envelope("bet", {
    bet: 2500,
    entropy: hash("x"),
    commitment: data.tables["bonkers-room"].commitment,
  });
  forged.command.payload.bet = 5000;
  await assert.rejects(
    () => service(data).command(p.account, forged),
    /signature/,
  );
  await assert.rejects(
    () => p.send("bet", { bet: 2500, entropy: hash("x"), commitment: "wrong" }),
    /Shuffle/,
  );
  await assert.rejects(
    () =>
      p.send("bet", {
        bet: 99999999,
        entropy: hash("x"),
        commitment: data.tables["bonkers-room"].commitment,
      }),
    /amount/,
  );
  await p.send("revoke");
  await assert.rejects(
    () =>
      p.send("bet", {
        bet: 2500,
        entropy: hash("x"),
        commitment: data.tables["bonkers-room"].commitment,
      }),
    /session/,
  );
  await p.send("authorize", { limit: 100000 });
  data.house = 0;
  await assert.rejects(
    () =>
      p.send("bet", {
        bet: 2500,
        entropy: hash("x"),
        commitment: data.tables["bonkers-room"].commitment,
      }),
    /reserves/,
  );
});
test("cashier credits once, expires quotes, rejects invalid networks and restores failed withdrawals", async () => {
  const data = emptyStore(),
    p = await player(data, "Cashier");
  const before = p.account.balance;
  const result = await p.send("deposit", {
    symbol: "USDC",
    network: "Base",
    amount: 100,
  });
  const t = result.result as { id: string };
  await p.send("simulate", { id: t.id });
  const transfer = p.account.transfers[0];
  transfer.createdAt -= 5000;
  service(data).tick();
  service(data).tick();
  service(data).tick();
  assert.equal(transfer.status, "completed");
  assert.equal(p.account.balance, before + 10000);
  await assert.rejects(() => p.send("simulate", { id: t.id }), /final/);
  conserved(data);
  await p.send("withdrawal", {
    symbol: "USDC",
    network: "Base",
    amount: 10000,
    address: "demo:wallet",
  });
  assert.equal(p.account.balance, before);
  await p.send("fail-transfer", { id: p.account.transfers[0].id });
  assert.equal(p.account.balance, before + 10000);
  conserved(data);
  await p.send("deposit", { symbol: "BTC", network: "Bitcoin", amount: 0.002 });
  p.account.transfers[0].expiresAt = Date.now() - 1;
  service(data).tick();
  assert.equal(p.account.transfers[0].status, "expired");
  await assert.rejects(
    () => p.send("simulate", { id: p.account.transfers[0].id }),
    /final/,
  );
  await assert.rejects(
    () =>
      p.send("deposit", { symbol: "USDC", network: "Ethereum", amount: 100 }),
    /Unsupported/,
  );
  await assert.rejects(
    () =>
      p.send("withdrawal", {
        symbol: "USDC",
        network: "Base",
        amount: 10000,
        address: "0xREAL",
      }),
    /demo destination/,
  );
});
test("missed turns automatically stand and survive persisted state reload", async () => {
  let data = emptyStore();
  const p = await player(data, "Offline");
  await p.send("seat", { index: 0 });
  await p.send("bet", {
    bet: 2500,
    entropy: hash("offline"),
    commitment: data.tables["bonkers-room"].commitment,
  });
  await p.send("deal");
  data = JSON.parse(JSON.stringify(data));
  const t = data.tables["bonkers-room"];
  if (t.round?.current) {
    while (t.round.current) { t.deadline = Date.now() - 1; service(data).tick(); }
    assert.equal(t.round.phase, "settled");
    assert.equal(t.actions[0].automatic, true);
  }
  assert.equal((await verifyReceipt(t.receipts[0])).valid, true);
  conserved(data);
});
test("private rooms are unguessable and seat ownership cannot be stolen", async () => {
  const d = emptyStore(),
    a = await player(d, "Alice"),
    b = await player(d, "Bob");
  const result = await a.send("create-table", { name: "Friends only" });
  const id = (result.result as { tableId: string }).tableId;
  assert.match(id, /^private-[a-f0-9]{24}$/);
  assert.equal(d.tables[id].private, true);
  await a.send("seat", { index: 0 }, id);
  await assert.rejects(() => b.send("seat", { index: 0 }, id), /taken/);
  await a.send("leave", {}, id);
  assert.equal(d.tables[id].seats[0], null);
});


test("table fee is explicit, conserved, session-capped and charged only once across outcomes", async () => {
  assert.equal(roundFee(500), 1);
  assert.equal(roundFee(2500), 6);
  assert.equal(roundFee(10000), 25);
  const results = new Set<string>();
  for (let i = 0; i < 80; i++) {
    const data = emptyStore(), p = await player(data, "Fee QA");
    const t = data.tables["bonkers-room"];
    t.seed = "fee-scenario-" + i; t.commitment = hash(t.seed);
    await p.send("seat", {index:0});
    const before = p.account.balance;
    await p.send("bet", {bet:2500, entropy:hash("fee-entropy"), commitment:t.commitment});
    assert.equal(p.account.balance, before - 2506);
    assert.equal(p.account.session.spent, 2506);
    assert.equal(data.feeRevenue, 6);
    await p.send("deal");
    if (t.round!.insurancePending) await p.send("decline-insurance", {roundId:t.round!.id});
    if (t.round!.current) await p.send("double", {roundId:t.round!.id});
    const r = t.receipts[0];
    assert.equal(r.version, 2);
    assert.equal(r.fees![p.account.id].amount, 6);
    assert.equal(data.feeRevenue, 6);
    assert.equal(p.account.balance, before - t.round!.players[0].committed - 6 + t.round!.players[0].payout);
    results.add(t.round!.players[0].hands[0].result!);
    assert.equal((await verifyReceipt(r)).valid, true);
    const altered = structuredClone(r); altered.fees![p.account.id].amount++;
    const {hash:_, ...body} = altered; altered.hash = hash(canonical(body));
    assert.equal((await verifyReceipt(altered)).valid, false);
    const revenue = data.feeRevenue; service(data).tick(); service(data).tick();
    assert.equal(data.feeRevenue, revenue); conserved(data);
  }
  assert.ok(results.has("You win") && results.has("Push") && (results.has("Dealer wins") || results.has("Bust")));
});

test("a fee cannot exceed account or session authorization and unsigned pricing is rejected", async () => {
  const data=emptyStore(), p=await player(data,"Limits");
  await p.send("seat",{index:0});
  const payload={bet:2500,entropy:hash("limits"),commitment:data.tables["bonkers-room"].commitment};
  await assert.rejects(()=>p.send("bet",{...payload,feePolicy:"wrong"}), /Fee policy/);
  p.account.session.limit=2500;
  await assert.rejects(()=>p.send("bet",payload), /Session spending/);
  p.account.session.limit=50000; p.account.balance=2500;
  await assert.rejects(()=>p.send("bet",payload), /Not enough/);
  assert.equal(data.feeRevenue,undefined);
});

test("in-flight legacy wagers settle without retroactive fees and v1 receipts remain verifiable", async () => {
  const data=emptyStore(), p=await player(data,"Legacy");
  await p.send("seat",{index:0});
  const t=data.tables["bonkers-room"];
  await p.send("bet",{bet:2500,entropy:hash("legacy"),commitment:t.commitment});
  const wager=t.bets[p.account.id];
  p.account.balance+=wager.fee!; p.account.session.spent-=wager.fee!; data.house-=wager.fee!; data.feeRevenue=0;
  delete wager.fee; delete wager.envelope.command.payload.feePolicy;
  wager.envelope.signature=Buffer.from(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},p.keys.privateKey,new TextEncoder().encode(canonical(wager.envelope.command)))).toString("base64");
  await p.send("deal");
  while(t.round!.current) await p.send("stand",{roundId:t.round!.id});
  const r=t.receipts[0]; assert.equal(r.fees![p.account.id].amount,0);
  assert.equal((await verifyReceipt(r)).valid,true);
  r.version=1; delete r.fees;
  const {hash:_,...body}=r; r.hash=hash(canonical(body));
  assert.equal((await verifyReceipt(r)).valid,true); conserved(data);
});


test("splitting never adds another table fee", async () => {
  const data=emptyStore(), p=await player(data,"Split fee");
  const t=data.tables["bonkers-room"], entropy=hash("split-fee");
  let chosen="";
  for(let i=0;i<1000;i++) {
    const seed="split-fee-"+i;
    const round=startRound("search",[{id:p.account.id,name:p.account.name,bet:2500,entropy}],seed);
    if(allowed(round,p.account.id,p.account.balance).includes("split")){chosen=seed;break;}
  }
  assert.ok(chosen); t.seed=chosen;t.commitment=hash(chosen);
  await p.send("seat",{index:0});
  await p.send("bet",{bet:2500,entropy,commitment:t.commitment});
  await p.send("deal");await p.send("split",{roundId:t.round!.id});
  while(t.round!.current) await p.send("stand",{roundId:t.round!.id});
  assert.equal(data.feeRevenue,6);
  assert.equal(p.account.session.spent,5006);
  assert.equal((await verifyReceipt(t.receipts[0])).valid,true);
  conserved(data);
});


test("staged chips stay unlocked and editable, and each Deal readies only its own player",async()=>{
  const data=emptyStore(),a=await player(data,"Stack A"),b=await player(data,"Stack B"),t=data.tables["bonkers-room"];
  await a.send("seat",{index:0});await b.send("seat",{index:1});
  const draft=(chips:number[])=>({chips,bet:chips.reduce((a,b)=>a+b,0),commitment:t.commitment,entropy:hash("stack entropy"),lockOnDeadline:true});
  await a.send("stage-bet",draft([500]));
  const deadline=t.betDeadline;
  await a.send("stage-bet",draft([500,500]));
  assert.equal(a.account.balance,100000);assert.equal(a.account.session.spent,0);assert.equal(t.bets[a.account.id],undefined);
  assert.equal(t.betDeadline,deadline);assert.deepEqual(service(data).view(t,a.account).seats[0]!.chips,[500,500]);
  await a.send("deal");
  assert.equal(a.account.balance,98998);assert.equal(t.bets[a.account.id].fee,2);assert.equal(t.round,null);
  await assert.rejects(()=>a.send("stage-bet",draft([500])),/closed/);
  await b.send("stage-bet",draft([2500]));await b.send("deal");
  assert.equal(t.round!.players.length,2);assert.equal(data.feeRevenue,8);
  while(t.round!.phase==="playing") await [a,b].find(p=>p.account.id===t.round!.players[t.round!.current![0]].id)!.send("stand",{roundId:t.round!.id});
  assert.equal(t.receipts[0].version,3);assert.equal((await verifyReceipt(t.receipts[0])).valid,true);conserved(data);
  const altered=structuredClone(t.receipts[0]);altered.bets[a.account.id].command.payload.lockOnDeadline=false;
  assert.equal((await verifyReceipt(altered)).valid,false);
});

test("persisted signed drafts auto-lock at the deadline once, even without the browser",async()=>{
  const data=emptyStore(),a=await player(data,"Offline"),t=data.tables["bonkers-room"];
  await a.send("seat",{index:0});
  await a.send("stage-bet",{chips:[500,500],bet:1000,commitment:t.commitment,entropy:hash("offline"),lockOnDeadline:true});
  const persisted=JSON.parse(JSON.stringify(data)) as Store,table=persisted.tables[t.id];table.betDeadline=Date.now()-1;
  service(persisted).tick();const balance=persisted.accounts[a.account.id].balance;
  assert.ok(table.round);assert.equal(table.bets[a.account.id].bet,1000);assert.equal(persisted.feeRevenue,2);
  service(persisted).tick();assert.equal(persisted.accounts[a.account.id].balance,balance);assert.equal(persisted.feeRevenue,2);conserved(persisted);
});

test("clearing and leaving cancel staged wagers; stale, forged and over-limit chip requests fail",async()=>{
  const data=emptyStore(),a=await player(data,"Clear"),t=data.tables["bonkers-room"];
  await a.send("seat",{index:0});
  const p={chips:[500],bet:500,commitment:t.commitment,entropy:hash("clear"),lockOnDeadline:true};
  const e=await a.envelope("stage-bet",p);e.command.payload.bet=1000;
  await assert.rejects(()=>service(data).command(a.account,e),/signature/);
  await assert.rejects(()=>a.send("stage-bet",{...p,bet:1000}),/total/);
  await assert.rejects(()=>a.send("stage-bet",{...p,lockOnDeadline:false}),/Authorize/);
  await assert.rejects(()=>a.send("stage-bet",{...p,chips:[10000,10000],bet:20000}),/Invalid/);
  await a.send("stage-bet",p);await a.send("stage-bet",{...p,chips:[],bet:0});
  assert.equal(t.betDeadline,null);assert.equal(a.account.balance,100000);
  await a.send("stage-bet",p);await a.send("leave");t.betDeadline=Date.now()-1;service(data).tick();assert.equal(t.round,null);assert.equal(a.account.balance,100000);
});

test("deadline rechecks revoked sessions, balances, minimum stakes and house reserves",async()=>{
  for(const reason of ["revoked","balance","minimum","reserve"]){
    const data=emptyStore(),a=await player(data,reason),t=data.tables["bonkers-room"];
    await a.send("seat",{index:0});
    const bet=reason==="minimum"?100:500;
    await a.send("stage-bet",{chips:[bet],bet,commitment:t.commitment,entropy:hash(reason),lockOnDeadline:true});
    if(reason==="revoked") await a.send("revoke");
    if(reason==="balance") a.account.balance=0;
    if(reason==="reserve") data.house=0;
    t.betDeadline=Date.now()-1;service(data).tick();
    assert.equal(t.round,null);assert.equal(t.bets[a.account.id],undefined);assert.ok(t.betNotices?.[a.account.id]);assert.equal(data.feeRevenue??0,0);
  }
});

test("insurance debit, signed replay, no double charging and dealer peek are conserved", async () => {
  for (const blackjack of [true,false]) {
    const data=emptyStore(); const p=await player(data,"Insurance"); const t=data.tables["bonkers-room"];
    await p.send("seat",{index:0});
    const entropy=hash("insurance-service");
    for(let n=0;;n++) {
      const seed="insurance-"+n;
      const r=startRound("probe",[{id:p.account.id,name:p.account.name,bet:1000,entropy}],seed);
      if(r.insurancePending && ((r.dealer[1]%13>=9)===blackjack)) { t.seed=seed;t.commitment=hash(seed); break; }
    }
    const before=p.account.balance;
    await p.send("bet",{bet:1000,entropy,commitment:t.commitment});
    await p.send("deal");
    assert.equal(t.round!.insurancePending,true);
    assert.equal(service(data).view(t,p.account).round!.dealer[1],-1);
    await p.send("insurance",{roundId:t.round!.id});
    assert.equal(p.account.session.spent,1502);
    await assert.rejects(p.send("insurance",{roundId:t.round!.id}));
    while(t.round!.current) await p.send("stand",{roundId:t.round!.id});
    assert.equal(p.account.balance,before-1502+t.round!.players[0].payout);
    assert.equal(t.round!.players[0].committed,1500);
    assert.equal((await verifyReceipt(t.receipts[0])).valid,true);
  }
});

test("signed late surrender returns half the wager with replayable receipt", async()=>{
  const data=emptyStore();const p=await player(data,"Surrender");const t=data.tables["bonkers-room"];
  await p.send("seat",{index:0});
  const entropy=hash("surrender-service");
  for(let n=0;;n++) {
    const seed="surrender-"+n;
    const r=startRound("probe",[{id:p.account.id,name:p.account.name,bet:1000,entropy}],seed);
    if(!r.insurancePending && r.current) {t.seed=seed;t.commitment=hash(seed);break;}
  }
  const before=p.account.balance;
  await p.send("bet",{bet:1000,entropy,commitment:t.commitment});await p.send("deal");
  await p.send("surrender",{roundId:t.round!.id});
  assert.equal(p.account.balance,before-502);
  assert.equal(t.round!.players[0].hands[0].result,"Surrender");
  assert.equal((await verifyReceipt(t.receipts[0])).valid,true);
});

test("insurance timeout declines after expiry and the offer never exposes surrender",async()=>{
 const data=emptyStore();const p=await player(data,"Timeout insurance");const t=data.tables["bonkers-room"];
 await p.send("seat",{index:0});const entropy=hash("timeout-insurance");
 for(let n=0;;n++) {const seed='timeout-'+n;const r=startRound('probe',[{id:p.account.id,name:p.account.name,bet:1000,entropy}],seed);if(r.insurancePending){t.seed=seed;t.commitment=hash(seed);break;}}
 await p.send("bet",{bet:1000,entropy,commitment:t.commitment});await p.send("deal");
 const spent=p.account.session.spent;p.account.session.expiresAt=Date.now()-1;
 assert.deepEqual(service(data).view(t,p.account).allowed,["decline-insurance","stand"]);
 await assert.rejects(p.send("insurance",{roundId:t.round!.id}));
 t.deadline=Date.now()-1;service(data).tick();
 assert.equal(t.round!.insurancePending,false);assert.equal(p.account.session.spent,spent);
 while(t.round!.current) {t.deadline=Date.now()-1;service(data).tick();}
 assert.equal((await verifyReceipt(t.receipts[0])).valid,true);
});

test("persisted original-rules rounds finish and their original shuffle receipts still replay",async()=>{
 const data=emptyStore();const p=await player(data,"Legacy round");const t=data.tables["bonkers-room"];
 await p.send("seat",{index:0});const entropy=hash("legacy-rules");
 for(let n=0;;n++){const seed='legacy-'+n;const r=legacy.startRound('old-round',[{id:p.account.id,name:p.account.name,bet:1000,entropy}],seed);if(r.current){t.seed=seed;t.commitment=hash(seed);break;}}
 await p.send("bet",{bet:1000,entropy,commitment:t.commitment});
 t.round=legacy.startRound('old-round',[{id:p.account.id,name:p.account.name,bet:1000,entropy}],t.seed);
 t.betDeadline=null;
 while(t.round.current) await p.send("stand",{roundId:t.round.id});
 assert.equal(t.receipts[0].rules,legacy.RULES);
 assert.equal((await verifyReceipt(t.receipts[0])).valid,true);
});
