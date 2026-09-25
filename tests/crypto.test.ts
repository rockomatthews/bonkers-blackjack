import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseUSDC,formatUSDC,units,wagerFee} from '../shared/crypto/money';
import {transition} from '../shared/crypto/lifecycle';
import {cryptoConfig,readiness,assertFinancialWrites} from '../server/crypto/config';
import {requirePrivateAccess,authenticate} from '../server/crypto/auth';
import {generateKeyPair,exportSPKI,SignJWT} from 'jose';
import {OneClick} from '../server/crypto/oneclick';
test('USDC never uses floating point and fees floor to cents',()=>{
 assert.equal(parseUSDC('9007199254740991.123456'),9007199254740991123456n);
 assert.equal(formatUSDC(parseUSDC('100.01')),'100.010000');
 assert.equal(wagerFee(parseUSDC('5')),10000n);
 for(const bad of ['-1','1e6','01','0.0000001','NaN'])assert.throws(()=>parseUSDC(bad));
 for(const bad of [1,'-1','1.0','01'])assert.throws(()=>units(bad));
});
test('mainnet remains closed even with a writes environment flag',()=>{
 const c=cryptoConfig({});assert.equal(c.enabled,false);assert.equal(readiness(c).realMoneyEnabled,false);
 assert.throws(()=>assertFinancialWrites({...c,mode:'private-mainnet',enabled:true,mainnetWrites:true}));
 assert.throws(()=>cryptoConfig({CRYPTO_MODE:'local-fork',CRYPTO_RPC_URL:'https://mainnet.base.org'}));
});
test('private endpoint gate rejects absent and incorrect credentials',()=>{
 const c={...cryptoConfig({}),privateAccessToken:'x'.repeat(32)};
 assert.throws(()=>requirePrivateAccess(new Request('https://localhost'),c));
 assert.throws(()=>requirePrivateAccess(new Request('https://localhost',{headers:{'x-bonkers-private-access':'y'.repeat(32)}}),c));
 requirePrivateAccess(new Request('https://localhost',{headers:{'x-bonkers-private-access':'x'.repeat(32)}}),c);
});
test('JWT requires correct issuer, audience and unexpired signature',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('ES256');
 const c={...cryptoConfig({}),privyAppId:'app-test',privyVerificationKey:await exportSPKI(publicKey)};
 const token=async(aud:string,expiration:string)=>new SignJWT({sid:'session'}).setProtectedHeader({alg:'ES256'}).setIssuer('privy.io').setAudience(aud).setSubject('did:privy:test').setIssuedAt().setExpirationTime(expiration).sign(privateKey);
 const req=(t:string)=>new Request('https://localhost',{headers:{authorization:`Bearer ${t}`}});
 assert.equal((await authenticate(req(await token('app-test','1m')),c)).subject,'did:privy:test');
 await assert.rejects(authenticate(req(await token('wrong','1m')),c));
 await assert.rejects(authenticate(req(await token('app-test','-1m')),c));
});
test('deposit cannot become available directly from a quote or conversion',()=>{
 assert.throws(()=>transition('quoted','available'));
 assert.throws(()=>transition('converting','available'));
 transition('settling','available');transition('available','available');
 assert.throws(()=>transition('completed','submitted'));
 transition('expired','detected');
});
test('unapproved conversion cannot allocate a payable address',async()=>{
 let called=false;const provider=new OneClick('',false,async()=>{called=true;throw Error('Must not call provider');});
 await assert.rejects(provider.quote({origin:'BTC:bitcoin',destination:'USDC:base',amount:'10000',recipient:'wallet',refundTo:'refund',dry:false}),/approval/);
 assert.equal(called,false);
});
test('quotes reject altered amounts, expired deadlines and counterfeit USDC metadata',async()=>{
 const tokens=[{assetId:'btc',symbol:'BTC',decimals:8,blockchain:'btc'},{assetId:'usdc',symbol:'USDC',decimals:6,blockchain:'base',contractAddress:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'}];
 let quote={amountIn:'10000',amountOut:'2000000',minAmountOut:'1990000',deadline:new Date(Date.now()+60000).toISOString(),depositAddress:'deposit'};
 const provider=new OneClick('',true,async(url)=>Response.json(String(url).endsWith('/tokens')?tokens:{quote}));
 const input={origin:'BTC:bitcoin' as const,destination:'USDC:base' as const,amount:'10000',recipient:'wallet',refundTo:'refund',dry:false};
 assert.equal((await provider.quote(input)).amountOut,'2000000');
 quote={...quote,amountIn:'9999'};await assert.rejects(provider.quote(input),/amounts/);
 quote={...quote,amountIn:'10000',deadline:'2000-01-01T00:00:00Z'};await assert.rejects(provider.quote(input),/deadline/);
 tokens[1].contractAddress='0x0000000000000000000000000000000000000001';await assert.rejects(provider.quote(input),/metadata/);
});
