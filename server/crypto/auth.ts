import {timingSafeEqual,createHash} from 'node:crypto';
import {importSPKI,jwtVerify} from 'jose';
import type {CryptoConfig} from './config';
const digest=(v:string)=>createHash('sha256').update(v).digest();
export function requirePrivateAccess(request:Request,c:CryptoConfig){
  const actual=request.headers.get('x-bonkers-private-access')??'';
  if(c.privateAccessToken.length<32||!timingSafeEqual(digest(actual),digest(c.privateAccessToken)))throw Error('Unauthorized');
}
export async function authenticate(request:Request,c:CryptoConfig){
  if(!c.privyAppId||!c.privyVerificationKey)throw Error('Wallet authentication is not configured');
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if(!token)throw Error('Unauthorized');
  const key=await importSPKI(c.privyVerificationKey,'ES256');
  const {payload}=await jwtVerify(token,key,{issuer:'privy.io',audience:c.privyAppId,algorithms:['ES256'],requiredClaims:['exp','iat','sub','sid'],clockTolerance:5});
  if(typeof payload.sub!=='string'||!payload.sub.startsWith('did:privy:')||typeof payload.sid!=='string')throw Error('Unauthorized');
  return {subject:payload.sub,sessionId:payload.sid};
}
