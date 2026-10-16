import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,keccak256,toHex} from 'viem';
import {tosses,verifyCoinReceipt,coinOdds,type TossCount,type CoinReceipt} from '../shared/crypto/coin';
const seed=keccak256(toHex('fixed secret')),entropy=keccak256(toHex('player entropy')),commitment=keccak256(encodeAbiParameters([{type:'bytes32'}],[seed]));
for(const count of [1,11,21] as TossCount[])test(`${count} tosses are deterministic, odd, replayable and reject altered payouts`,()=>{
 const flips=tosses(seed,entropy,count),heads=flips.filter(v=>v==='H').length;assert.equal(flips.length,count);assert.notEqual(heads*2,count);assert.deepEqual(tosses(seed,entropy,count),flips);assert.deepEqual(coinOdds(count),{win:.5,lose:.5,tie:0});
 const r:CoinReceipt={id:seed,commitment,seed,entropy,count,choice:0,stake:'5000000',payout:heads*2>count?'10000000':'0',heads,push:false,transaction:entropy};assert.deepEqual(verifyCoinReceipt(r),flips);assert.throws(()=>verifyCoinReceipt({...r,payout:'1'}),/payout/);assert.throws(()=>verifyCoinReceipt({...r,seed:entropy}),/commitment/);
});
test('even batch receipts are rejected rather than inventing a tiebreak',()=>{assert.throws(()=>verifyCoinReceipt({count:10} as unknown as CoinReceipt),/Invalid/);assert.throws(()=>verifyCoinReceipt({count:20} as unknown as CoinReceipt),/Invalid/);});
