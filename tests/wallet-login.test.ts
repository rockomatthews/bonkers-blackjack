import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {privateKeyToAccount} from 'viem/accounts';
import {parseSiweMessage} from 'viem/siwe';
import {challenge,login,session} from '../server/crypto/house';
import {houseTransaction} from '../server/crypto/house-store';
import {POST} from '../app/api/house/[action]/route';
import {walletLoginMessage} from '../shared/crypto/house';
test('SIWE login binds domain, address, nonce and expiry, survives slow approval, and needs no chain RPC for an EOA',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bonkers-auth-'));const saved={...process.env};
 try{
  delete process.env.VERCEL;delete process.env.BONKERS_DEALER_DATABASE_URL;delete process.env.POSTGRES_URL;delete process.env.DATABASE_URL;
  Object.assign(process.env,{BONKERS_LOCAL_STORE:'1',BONKERS_LOCAL_DIR:dir,BONKERS_RPC_URL:'http://127.0.0.1:1',BONKERS_DEALER_KEY:'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'});
  const account=privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'),origin='https://www.bonkers.cash';process.env.BONKERS_SITE_ORIGIN='https://bonkers-blackjack.vercel.app';const response=await POST(new Request(origin+'/api/house/challenge',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({owner:account.address})}),{params:Promise.resolve({action:'challenge'})});assert.equal(response.status,200);const c=await response.json(),parsed=parseSiweMessage(c.message);
  assert.equal(parsed.domain,'www.bonkers.cash');assert.equal(parsed.uri,origin);assert.equal(parsed.address,account.address);assert.equal(parsed.chainId,8453);assert.equal(parsed.nonce,c.nonce);assert.equal(parsed.version,'1');assert.equal(parsed.expirationTime!.getTime()-parsed.issuedAt!.getTime(),600000);
  const signature=await account.signMessage({message:c.message});await assert.rejects(login(account.address,c.nonce,signature,'https://attacker.example'),/expired/);const token=await login(account.address,c.nonce,signature,origin);assert.equal((await session(token,origin)).toLowerCase(),account.address.toLowerCase());await assert.rejects(login(account.address,c.nonce,signature,origin),/expired|used/);await assert.rejects(session(token,'https://attacker.example'));await assert.rejects(session(token,'https://bonkers.cash'));
  const expired=await challenge(account.address,origin);await houseTransaction(s=>{s.challenges[expired.nonce].expires=Date.now()-1;});await assert.rejects(login(account.address,expired.nonce,await account.signMessage({message:expired.message}),origin),/expired/);
  const legacyNonce='legacyPendingNonce';await houseTransaction(s=>{s.challenges[legacyNonce]={owner:account.address,expires:Date.now()+60000};});const legacy=await account.signMessage({message:walletLoginMessage(origin,account.address,legacyNonce)});assert.ok(await login(account.address,legacyNonce,legacy,origin));
 }finally{for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);await rm(dir,{recursive:true,force:true});}
});
