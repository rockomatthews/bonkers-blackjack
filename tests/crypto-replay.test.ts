import {test} from 'node:test';import assert from 'node:assert/strict';
import {initial,step,total,legalMoves,payouts,shuffle,observation} from '../shared/crypto/replay';
import {verifyCryptoReceipt} from '../shared/crypto/verify-receipt';
import {keccak256,encodeAbiParameters,type Hex} from 'viem';
const rig=(prefix:number[])=>[...prefix,...Array.from({length:312-prefix.length},(_,i)=>i)];
test('crypto replay stands on soft 17 and pays ordinary wins',()=>{const d=rig([9,0,7,5]);const s=initial(d,1);step(s,d,{seat:0,move:6});step(s,d,{seat:0,move:2});assert.equal(total(s.dealer),17);assert.equal(s.dealer.length,2);assert.deepEqual(payouts(s,[10000000n]),[20000000n]);});
test('split aces draw one card, cannot resplit, and split 21 pays normally',()=>{const d=rig([0,9,13,6,8,12]);const s=initial(d,1);assert(legalMoves(s).includes(4));assert.equal(step(s,d,{seat:0,move:4}),2);assert(s.done);assert(s.seats[0].hands.every(h=>h.cards.length===2&&h.done));assert.deepEqual(payouts(s,[10000000n]),[40000000n]);});
test('natural beats ordinary 21, pays 3:2, and pushes against dealer natural',()=>{assert.deepEqual(payouts(initial(rig([0,9,12,0]),1),[10000000n]),[10000000n]);const s=initial(rig([0,9,12,6]),1);assert(s.done);assert.deepEqual(payouts(s,[10000000n]),[25000000n]);});
test('double draws exactly one card and doubles stake',()=>{const d=rig([4,9,5,6,12]);const s=initial(d,1);assert.equal(step(s,d,{seat:0,move:3}),2);assert(s.done);assert.equal(s.seats[0].hands[0].cards.length,3);assert.deepEqual(payouts(s,[10000000n]),[40000000n]);assert.throws(()=>step(s,d,{seat:0,move:1}));});
test('receipt replay rejects modified observations and payouts',()=>{const seed=`0x${'12'.repeat(32)}` as Hex,entropy=`0x${'34'.repeat(32)}` as Hex,d=shuffle(seed,entropy),s=initial(d,7),actions:{seat:number;move:number}[]=[],observations:Hex[]=[];while(!s.done){observations.push(observation(s));const a={seat:s.active,move:2};actions.push(a);step(s,d,a);}observations.push(observation(s));const receipt={id:seed,seed,entropy,commitment:keccak256(encodeAbiParameters([{type:'bytes32'}],[seed])),stakes:Array(7).fill('5000000'),actions,observations,payouts:payouts(s,Array(7).fill(5000000n)).map(String),settlementHash:seed};assert(verifyCryptoReceipt(receipt).valid);assert.throws(()=>verifyCryptoReceipt({...receipt,payouts:Array(7).fill('1')}));assert.throws(()=>verifyCryptoReceipt({...receipt,observations:['0x',...observations.slice(1)]}));assert.throws(()=>verifyCryptoReceipt({...receipt,stakes:Array(7).fill('-1')}));assert.throws(()=>verifyCryptoReceipt({...receipt,stakes:Array(7).fill('5000001')}));});

test('insurance precedes the peek, takes half the stake and pays three times the premium',()=>{
 const d=rig([9,0,8,12]),s=initial(d,1);
 assert.equal(s.insurance,true);assert.deepEqual(legalMoves(s),[2,5,6]);
 assert.throws(()=>step(s,d,{seat:0,move:7}));
 assert.equal(step(s,d,{seat:0,move:5}),1);assert(s.done);
 assert.deepEqual(payouts(s,[5000000n]),[7500000n]);
 assert.throws(()=>step(s,d,{seat:0,move:5}));
});
test('insured blackjack returns even money regardless of dealer peek outcome',()=>{
 for(const hole of [5,12]){const d=rig([0,13,9,hole]),s=initial(d,1);assert(s.insurance);step(s,d,{seat:0,move:5});assert(s.done);assert.equal(payouts(s,[5000000n])[0]-7500000n,5000000n);}
});
test('all seats including naturals decide insurance and timeout stand declines for free',()=>{
 const d=rig([0,9,0,9,8,12]),s=initial(d,2);
 assert(s.insurance);assert(s.seats[0].hands[0].done);
 assert.equal(step(s,d,{seat:0,move:5}),1);assert.equal(s.active,1);assert(!s.done);
 assert.equal(step(s,d,{seat:1,move:2}),0);assert(s.done);assert.deepEqual(payouts(s,[5000000n,5000000n]),[12500000n,0n]);
});
test('late surrender returns half, skips unneeded dealer draws, and cannot follow hits or splits',()=>{
 const d=rig([9,8,5,6]),s=initial(d,1),cursor=s.cursor;
 assert(legalMoves(s).includes(7));assert.equal(step(s,d,{seat:0,move:7}),0);assert(s.done);assert.equal(s.cursor,cursor);assert.deepEqual(payouts(s,[5000000n]),[2500000n]);
 for(const action of [1,4]){const d=rig([7,9,20,6]),s=initial(d,1);step(s,d,{seat:0,move:action});assert(!legalMoves(s).includes(7));assert.throws(()=>step(s,d,{seat:0,move:7}));}
});

test('old version-one receipts still reproduce the original byte encoding and rules',async()=>{
 const v1=await import('../shared/crypto/replay-v1');const seed=`0x${'12'.repeat(32)}` as Hex,entropy=`0x${'34'.repeat(32)}` as Hex;
 const d=v1.shuffle(seed,entropy),s=v1.initial(d,7),actions:{seat:number;move:number}[]=[],observations:Hex[]=[];
 while(!s.done){observations.push(v1.observation(s));const a={seat:s.active,move:2};actions.push(a);v1.step(s,d,a);}observations.push(v1.observation(s));
 const receipt={id:seed,seed,entropy,commitment:keccak256(encodeAbiParameters([{type:'bytes32'}],[seed])),stakes:Array(7).fill('5000000'),actions,observations,payouts:v1.payouts(s,Array(7).fill(5000000n)).map(String),settlementHash:seed};
 assert.equal(verifyCryptoReceipt(receipt).valid,true);
 const corrupted=[...observations];corrupted[0]=('0x02'+corrupted[0].slice(4)) as Hex;
 assert.throws(()=>verifyCryptoReceipt({...receipt,observations:corrupted}));
});
