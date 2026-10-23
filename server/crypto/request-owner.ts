import {cookies} from 'next/headers';
import {isAddress} from 'viem';
import {session} from './house';
export async function requestOwner(origin:string,request:Request){try{
 const requested=request.headers.get('x-bonkers-wallet'),jar=await cookies();
 if(requested&&!isAddress(requested))throw Error('Invalid wallet selector');
 const token=requested?jar.get('bonkers-wallet-'+requested.toLowerCase())?.value??jar.get('bonkers-wallet')?.value:jar.get('bonkers-wallet')?.value;
 const owner=await session(token??'',origin);
 if(requested&&requested.toLowerCase()!==owner.toLowerCase())throw Error('Wallet session mismatch');
 if(requested&&!jar.get('bonkers-wallet-'+requested.toLowerCase()))jar.set('bonkers-wallet-'+requested.toLowerCase(),token!,{httpOnly:true,sameSite:'strict',secure:new URL(origin).protocol==='https:',path:'/',maxAge:3600});
 return owner;
}catch{throw Error('Reconnect your wallet');}}
