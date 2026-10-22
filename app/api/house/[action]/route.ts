import {after} from 'next/server';
import {readTableSession,registerTable,offerTableSession,betTableSession,actTableSession,settleTableSession,closeTableSession,migrationStatus,registerSessionDeployment,activateSessionDeployment} from '../../../../server/crypto/table-service';
import {playerRpc,advanceGameplay} from '../../../../server/crypto/player-rpc';
import {walletBalances} from '../../../../server/crypto/balances';
import {cookies} from 'next/headers';
import {houseRequestOrigin,housePostOrigin} from '../../../../server/crypto/origin';
import {isAddress,isHex,type Address,type Hex} from 'viem';
import {houseStatus,challenge,login,session,register,offer,offerTable,progress,readRound,readRoundById,readTable,offerCoin,progressCoin,readCoin} from '../../../../server/crypto/house';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const headers={'Cache-Control':'no-store'};
function logFailure(action:string,e:unknown){const err=e as {name?:string;code?:string|number};console.error('bonkers-house-api',{action,error:err?.name??'UnknownError',code:err?.code});}
async function requestOwner(origin:string,request:Request){try{
 const requested=request.headers.get('x-bonkers-wallet'),jar=await cookies();
 if(requested&&!isAddress(requested))throw Error('Invalid wallet selector');
 const token=requested?jar.get('bonkers-wallet-'+requested.toLowerCase())?.value??jar.get('bonkers-wallet')?.value:jar.get('bonkers-wallet')?.value;
 const owner=await session(token??'',origin);
 if(requested&&requested.toLowerCase()!==owner.toLowerCase())throw Error('Wallet session mismatch');
 if(requested&&!jar.get('bonkers-wallet-'+requested.toLowerCase()))jar.set('bonkers-wallet-'+requested.toLowerCase(),token!,{httpOnly:true,sameSite:'strict',secure:new URL(origin).protocol==='https:',path:'/',maxAge:3600});
 return owner;
}catch{throw Error('Reconnect your wallet');}}
export async function GET(request:Request,{params}:{params:Promise<{action:string}>}){
 const{action}=await params;try{if(action==='status')return Response.json(await houseStatus(),{headers});const origin=houseRequestOrigin(request);if(!origin)return Response.json({error:'Unrecognized site origin'},{status:403,headers});if(action==='table-session')return Response.json(await readTableSession(await requestOwner(origin,request)),{headers});if(action==='table-migration')return Response.json(await migrationStatus(await requestOwner(origin,request)),{headers});if(action==='balances')return Response.json(await walletBalances(await requestOwner(origin,request)),{headers});if(action==='table')return Response.json(await readTable(await requestOwner(origin,request)),{headers});if(action==='session'){const owner=await requestOwner(origin,request);return Response.json({owner},{headers});}if(action==='coin'){const owner=await requestOwner(origin,request);return Response.json(await readCoin(owner),{headers});}if(action==='round'){const owner=await requestOwner(origin,request);return Response.json(await readRound(owner),{headers});}return new Response(null,{status:404});}catch(e){const auth=e instanceof Error&&e.message==='Reconnect your wallet';if(!auth)logFailure(action,e);return Response.json({error:auth?'Reconnect your wallet.':'The dealer could not refresh the hand. Your wallet is still connected; retry or recover the round.'},{status:auth?401:503,headers});}
}
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
 const origin=housePostOrigin(request);if(!origin)return Response.json({error:'Same-origin request required'},{status:403,headers});
 const{action}=await params;try{
  const text=await request.text();if(text.length>8192)return new Response(null,{status:413});const b=JSON.parse(text);
  if(action==='challenge'){if(typeof b.owner!=='string'||!isAddress(b.owner))throw Error('Invalid wallet');return Response.json(await challenge(b.owner as Address,origin),{headers});}
  if(action==='login'){if(!isAddress(b.owner)||typeof b.nonce!=='string'||!isHex(b.signature))throw Error('Invalid sign-in');const token=await login(b.owner,b.nonce,b.signature,origin);const jar=await cookies(),options={httpOnly:true,sameSite:'strict' as const,secure:new URL(origin).protocol==='https:',path:'/',maxAge:3600};jar.set('bonkers-wallet',token,options);jar.set('bonkers-wallet-'+b.owner.toLowerCase(),token,options);return Response.json({connected:true},{headers});}
  const owner=await requestOwner(origin,request);
  if(action==='table-register'){if(b.hash!==undefined&&(!isHex(b.hash)||b.hash.length!==66))throw Error('Invalid table opening receipt');return Response.json(await registerTable(owner,b.hash),{headers});}
  if(action==='table-session-offer')return Response.json(await offerTableSession(owner,b.bets),{headers});
  if(action==='table-session-bet'||action==='table-session-act'||action==='table-session-close'){
   if(!isHex(b.id)||b.id.length!==66||!isHex(b.signature)||b.signature.length!==132)throw Error('Invalid signed table request');
   if(action==='table-session-close')return Response.json(await closeTableSession(owner,b.id,b.signature),{headers});
   const result=action==='table-session-bet'?(isHex(b.entropy)&&b.entropy.length===66?await betTableSession(owner,b.id,b.entropy,b.signature):(()=>{throw Error('Invalid entropy');})()):await actTableSession(owner,b.id,b.seat,b.index,b.move,b.signature);
   if(result.hands.length&&result.hands.every(h=>h.state.done))after(()=>settleTableSession(owner));return Response.json(result,{headers});
  }
  if(action==='table-session-progress'){await registerTable(owner);after(()=>settleTableSession(owner));return Response.json(await readTableSession(owner),{headers});}
  if(action==='table-deployment-register'){if(!isHex(b.hash)||b.hash.length!==66)throw Error('Invalid deployment');return Response.json(await registerSessionDeployment(owner,b.hash),{headers});}
  if(action==='table-deployment-activate')return Response.json(await activateSessionDeployment(owner),{headers});
  if(action==='rpc'){const result=await playerRpc(owner,b.method,b.params??[]);if(b.method==='eth_sendRawTransaction'&&typeof result==='string'&&/^0x[0-9a-fA-F]{64}$/.test(result))after(()=>advanceGameplay(owner,b.params[0] as Hex,result as Hex));return Response.json({result},{headers});}
  if(action==='register'){if(typeof b.hash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(b.hash))throw Error('Invalid deployment receipt');return Response.json(await register(owner,b.hash as Hex),{headers});}
  if(action==='coin-offer'){if(typeof b.amount!=='string'||![1,11,21].includes(b.count))throw Error('Invalid coin terms');return Response.json(await offerCoin(owner,b.amount,b.count),{headers});}
  if(action==='coin-progress'){if(typeof b.id!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(b.id))throw Error('Invalid round');await progressCoin(owner,b.id);return Response.json(await readCoin(owner),{headers});}
  if(action==='table-offer'){if(!Array.isArray(b.bets)||b.bets.some((bet:unknown)=>!bet||typeof (bet as {amount?:unknown}).amount!=='string'||!Number.isInteger((bet as {seat?:unknown}).seat)))throw Error('Invalid seat wagers');return Response.json(await offerTable(owner,b.bets),{headers});}
  if(action==='offer'){if(b.amount!==undefined&&typeof b.amount!=='string')throw Error('Invalid wager');if(b.seat!==undefined&&(!Number.isInteger(b.seat)||b.seat<0||b.seat>6))throw Error('Invalid seat');return Response.json(await offer(owner,b.amount,b.seat),{headers});}
  if(action==='progress'){if(typeof b.id!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(b.id))throw Error('Invalid round');await progress(owner,b.id);return Response.json(await readRoundById(owner,b.id),{headers});}
  return new Response(null,{status:404});
 }catch(e){const message=e instanceof Error?e.message:'Request failed';if(!/^(Only |Invalid |Reconnect |Deposit |Deposits |House capacity|Dealer capacity|Finish or recover)/.test(message))logFailure(action,e);const safe=/^(Table |Session tables |Recovery monitor |Close existing |Finish existing |Fund at least |No session |A session |Table approval expired|Only the house|Table deployment|A shared house|Wallet |Invalid |Reconnect |Deposit at least|Deposits are |Round unavailable|Waiting for|Dealer is |House setup|Shared table|House capacity|Dealer capacity|Finish or recover|Deposit enough|Toin Coss)/.test(message)?message:'The dealer is temporarily unavailable. Your wallet funds remain under contract control; refresh or recover the round.';return Response.json({error:safe},{status:400,headers});}
}
