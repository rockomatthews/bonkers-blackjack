import {cookies} from 'next/headers';
import {isAddress,isHex,type Address,type Hex} from 'viem';
import {houseStatus,challenge,login,session,register,offer,progress,readRound,offerCoin,progressCoin,readCoin} from '../../../../server/crypto/house';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const headers={'Cache-Control':'no-store'};
const siteOrigin=()=>new URL(process.env.BONKERS_SITE_ORIGIN??'https://bonkers-blackjack.vercel.app').origin;
export async function GET(request:Request,{params}:{params:Promise<{action:string}>}){
 try{const{action}=await params;if(action==='status')return Response.json(await houseStatus(),{headers});if(action==='coin'){const owner=await session((await cookies()).get('bonkers-wallet')?.value??'',siteOrigin());return Response.json(await readCoin(owner),{headers});}if(action==='round'){const owner=await session((await cookies()).get('bonkers-wallet')?.value??'',siteOrigin());return Response.json(await readRound(owner),{headers});}return new Response(null,{status:404});}catch{return Response.json({error:'Reconnect your wallet to load the round.'},{status:401,headers});}
}
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
 const origin=siteOrigin();if(request.headers.get('origin')!==origin)return Response.json({error:'Same-origin request required'},{status:403,headers});
 try{
  const text=await request.text();if(text.length>8192)return new Response(null,{status:413});const b=JSON.parse(text);const{action}=await params;
  if(action==='challenge'){if(typeof b.owner!=='string'||!isAddress(b.owner))throw Error('Invalid wallet');return Response.json(await challenge(b.owner as Address,origin),{headers});}
  if(action==='login'){if(!isAddress(b.owner)||typeof b.nonce!=='string'||!isHex(b.signature))throw Error('Invalid sign-in');const token=await login(b.owner,b.nonce,b.signature,origin);(await cookies()).set('bonkers-wallet',token,{httpOnly:true,sameSite:'strict',secure:new URL(origin).protocol==='https:',path:'/',maxAge:3600});return Response.json({connected:true},{headers});}
  const owner=await session((await cookies()).get('bonkers-wallet')?.value??'',origin);
  if(action==='register'){if(typeof b.hash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(b.hash))throw Error('Invalid deployment receipt');return Response.json(await register(owner,b.hash as Hex),{headers});}
  if(action==='coin-offer'){if(typeof b.amount!=='string'||![1,11,21].includes(b.count))throw Error('Invalid coin terms');return Response.json(await offerCoin(owner,b.amount,b.count),{headers});}
  if(action==='coin-progress'){if(typeof b.id!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(b.id))throw Error('Invalid round');await progressCoin(owner,b.id);return Response.json(await readCoin(owner),{headers});}
  if(action==='offer')return Response.json(await offer(owner),{headers});
  if(action==='progress'){if(typeof b.id!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(b.id))throw Error('Invalid round');await progress(owner,b.id);return Response.json(await readRound(owner),{headers});}
  return new Response(null,{status:404});
 }catch(e){const message=e instanceof Error?e.message:'Request failed';const safe=/^(Only the house|Table deployment|A shared house|Wallet |Invalid |Reconnect |Deposit at least|Deposits are |Round unavailable|Waiting for|Dealer is |House setup|Shared table|House capacity|Dealer capacity|Finish or recover|Deposit enough|Toin Coss)/.test(message)?message:'The dealer is temporarily unavailable. Your wallet funds remain under contract control; refresh or recover the round.';return Response.json({error:safe},{status:400,headers});}
}
