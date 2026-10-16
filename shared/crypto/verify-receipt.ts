import {encodeAbiParameters,keccak256} from 'viem';
import type {LabReceipt} from '../../server/crypto/lab-types';
import {replayEngine} from './engines';
/** Independent replay; chain inclusion must additionally be checked against the settlement tx. */
export function verifyCryptoReceipt(receipt:LabReceipt){
 if(keccak256(encodeAbiParameters([{type:'bytes32'}],[receipt.seed]))!==receipt.commitment)throw Error('Commitment mismatch');
 if(receipt.observations.length!==receipt.actions.length+1)throw Error('Incomplete observations');
 const version=Number.parseInt(receipt.observations[0]?.slice(2,4)??'',16);
 const {shuffle,initial,observation,step,payouts}=replayEngine(version);
 if(version===2){
  if(receipt.actions.length>512)throw Error('Transcript bound');
  for(const amount of receipt.stakes){
   if(!/^[1-9]\d*$/.test(amount))throw Error('Invalid stake');
   const stake=BigInt(amount);
   if(stake<1000000n||stake>1000000000000n||stake%1000000n!==0n)throw Error('Invalid stake');
  }
 }
 const deck=shuffle(receipt.seed,receipt.entropy),state=initial(deck,receipt.stakes.length);
 receipt.actions.forEach((action,i)=>{if(observation(state)!==receipt.observations[i])throw Error('Altered observation');step(state,deck,action);});
 if(observation(state)!==receipt.observations.at(-1))throw Error('Altered final observation');
 const paid=payouts(state,receipt.stakes.map(BigInt)).map(String);
 if(JSON.stringify(paid)!==JSON.stringify(receipt.payouts))throw Error('Payout mismatch');
 return {valid:true,payouts:paid};
}
