import {createHash} from 'node:crypto';
import {fetchBeacon,type ChainClient,type ChainInfo} from 'drand-client';
import {EVMNET,beaconForMinute,type PublicFlip,minuteTerms} from '../../shared/crypto/global-coin';
import {communityTransaction} from '../community-store';
const info:ChainInfo={public_key:EVMNET.key,period:3,genesis_time:EVMNET.genesis,hash:EVMNET.hash,groupHash:'',schemeID:'bls-bn254-unchained-on-g1',metadata:{beaconID:'evmnet'}};
const options={disableBeaconVerification:false,noCache:false,chainVerificationParams:{chainHash:EVMNET.hash,publicKey:EVMNET.key}};
const client:ChainClient={options,chain:()=>({baseUrl:'https://api.drand.sh/v2/beacons/evmnet',info:async()=>info}),latest:async()=>{throw Error('Explicit future beacon required');},get:async round=>{
 const response=await fetch(`https://api.drand.sh/v2/beacons/evmnet/rounds/${round}`,{signal:AbortSignal.timeout(6000),cache:'no-store'});if(!response.ok)throw Error('Beacon pending');const b=await response.json();if(b.round!==round||typeof b.signature!=='string'||!/^[0-9a-f]{128}$/i.test(b.signature))throw Error('Invalid beacon response');return{...b,randomness:createHash('sha256').update(Buffer.from(b.signature,'hex')).digest('hex')};
}};
const g=globalThis as unknown as {publicFlips?:Map<number,PublicFlip>;flipPromises?:Map<number,Promise<PublicFlip>>;publicFlipStart?:number};
export async function verifiedFlip(minute:number):Promise<PublicFlip>{if(!Number.isSafeInteger(minute)||(minute+1)*60000>Date.now())throw Error('Flip not due');g.publicFlips??=new Map();g.flipPromises??=new Map();const cached=g.publicFlips.get(minute);if(cached)return cached;const pending=g.flipPromises.get(minute);if(pending)return pending;
 const task=(async()=>{const beacon=beaconForMinute(minute),wait=(EVMNET.genesis+(beacon-1)*3)*1000+200-Date.now();if(wait>0)await new Promise(resolve=>setTimeout(resolve,Math.min(wait,3500)));let b;try{b=await fetchBeacon(client,beacon);}catch{await new Promise(resolve=>setTimeout(resolve,1000));b=await fetchBeacon(client,beacon);}const flip:PublicFlip={minute,at:(minute+1)*60000,beacon,signature:b.signature,randomness:b.randomness,face:BigInt('0x'+b.randomness)%2n===0n?'heads':'tails'};g.publicFlips!.set(minute,flip);if(g.publicFlips!.size>180)g.publicFlips!.delete(g.publicFlips!.keys().next().value!);return flip;})();g.flipPromises.set(minute,task);try{return await task;}finally{g.flipPromises.delete(minute);}
}
export async function publicFlips(){const now=Date.now(),terms=minuteTerms(now),start=g.publicFlipStart??=await communityTransaction('public-flip-start',()=>({minute:terms.minute}),s=>s.minute);const minutes=Array.from({length:Math.min(30,Math.max(0,terms.minute-start))},(_,i)=>terms.minute-1-i);const records:PublicFlip[]=[];for(let i=0;i<minutes.length;i+=6){const results=await Promise.allSettled(minutes.slice(i,i+6).map(verifiedFlip));for(const r of results)if(r.status==='fulfilled')records.push(r.value);}
 return{serverNow:Date.now(),...minuteTerms(Date.now()),startMinute:start,history:records,missing:minutes.filter(m=>!records.some(r=>r.minute===m))};
}
