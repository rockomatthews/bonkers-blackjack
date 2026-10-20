import {test} from 'node:test';
import assert from 'node:assert/strict';
import {houseRequestOrigin,housePostOrigin} from '../server/crypto/origin';
import {POST} from '../app/api/house/[action]/route';
import {houseStatus} from '../server/crypto/house';
import {HOUSE_ADDRESS,walletLoginMessage} from '../shared/crypto/house';
import {discoverWallets} from '../shared/crypto/wallets';
import type {EIP1193Provider} from 'viem';
test('house is pinned and unconfigured dealer fails closed',async()=>{const s=await houseStatus();assert.equal(s.house,HOUSE_ADDRESS);assert.equal(s.depositsOpen,false);assert.equal(s.dealerReady,false);});
test('CSRF rejects a hostile origin even when Host matches it',async()=>{const response=await POST(new Request('https://attacker.example/api/house/challenge',{method:'POST',headers:{host:'attacker.example',origin:'https://attacker.example'},body:JSON.stringify({owner:HOUSE_ADDRESS})}),{params:Promise.resolve({action:'challenge'})});assert.equal(response.status,403);});
test('wallet sign-in binds the site and address and disclaims transaction authority',()=>{const m=walletLoginMessage('https://bonkers-blackjack.vercel.app',HOUSE_ADDRESS,'nonce');assert.match(m,/bonkers-blackjack.vercel.app/);assert.ok(m.includes(HOUSE_ADDRESS.toLowerCase()));assert.match(m,/does not authorize transactions/);assert.match(m,/Base \(8453\)/);});
test('EIP6963 discovers Base separately from the Phantom default provider',()=>{const w=new EventTarget() as EventTarget&{ethereum?:unknown};const base={request:async()=>null} as unknown as EIP1193Provider,phantom={isPhantom:true,request:async()=>null};w.ethereum=phantom;const original=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{value:w,configurable:true});let found:ReturnType<typeof collect>=[];function collect(){return [] as {name:string;base:boolean;provider:EIP1193Provider}[];}try{w.addEventListener('eip6963:requestProvider',()=>w.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'base',rdns:'com.coinbase.wallet',name:'Coinbase Wallet'},provider:base}})));const stop=discoverWallets(list=>{found=list;});assert.equal(found[0].provider,base);assert.equal(found[0].base,true);assert.ok(found.some(o=>o.name==='Phantom'));stop();}finally{if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');}});
test('announced wallets replace duplicate legacy wrappers without hiding other extensions',()=>{
 const announced={request:async()=>null} as unknown as EIP1193Provider,legacy={isMetaMask:true,request:async()=>null},phantom={isPhantom:true,isMetaMask:true,request:async()=>null};
 const w=new EventTarget() as EventTarget&{ethereum?:unknown};w.ethereum={providers:[legacy,phantom]};const original=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{value:w,configurable:true});let found:{name:string;provider:EIP1193Provider}[]=[];
 try{w.addEventListener('eip6963:requestProvider',()=>w.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'metamask-announced',rdns:'io.metamask',name:'MetaMask'},provider:announced}})));const stop=discoverWallets(list=>{found=list;});assert.equal(found.filter(v=>v.name==='MetaMask').length,1);assert.equal(found.find(v=>v.name==='MetaMask')!.provider,announced);assert.ok(found.some(v=>v.name==='Phantom'));stop();}finally{if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');}
});

test('custom domains bind sign-in to the page origin even with the previous domain configured',()=>{
 const saved=process.env.BONKERS_SITE_ORIGIN;process.env.BONKERS_SITE_ORIGIN='https://bonkers-blackjack.vercel.app';
 try{for(const origin of ['https://bonkers.cash','https://www.bonkers.cash','https://bonkers-blackjack.vercel.app']){
  const request=new Request(origin+'/api/house/challenge',{method:'POST',headers:{origin}});
  assert.equal(houseRequestOrigin(request),origin);assert.equal(housePostOrigin(request),origin);
 }}finally{if(saved===undefined)delete process.env.BONKERS_SITE_ORIGIN;else process.env.BONKERS_SITE_ORIGIN=saved;}
});
test('origin gate rejects hostile sites, absent origins, sibling-domain CSRF, and spoofed proxy headers',()=>{
 for(const [url,origin,extra]of [
  ['https://attacker.example','https://attacker.example',{}],
  ['https://www.bonkers.cash','https://attacker.example',{}],
  ['https://www.bonkers.cash','https://bonkers.cash',{}],
  ['https://www.bonkers.cash','null',{}],
  ['https://www.bonkers.cash','',{}],
  ['https://attacker.example','https://attacker.example',{host:'www.bonkers.cash','x-forwarded-host':'www.bonkers.cash'}],
  ['https://attacker.example','https://www.bonkers.cash',{'x-forwarded-host':'www.bonkers.cash'}],
  ['https://www.bonkers.cash','https://www.bonkers.cash',{host:'attacker.example'}],
  ['http://www.bonkers.cash','http://www.bonkers.cash',{}],
 ] as const){assert.equal(housePostOrigin(new Request(url+'/api/house/challenge',{method:'POST',headers:{...(origin?{origin}:{}),...extra}})),null);}
});

test('configured local origin survives Next internal URL reconstruction',()=>{const saved=process.env.BONKERS_SITE_ORIGIN;process.env.BONKERS_SITE_ORIGIN='http://127.0.0.1:3108';try{assert.equal(housePostOrigin(new Request('http://localhost:3108/api/house/challenge',{method:'POST',headers:{host:'127.0.0.1:3108',origin:'http://127.0.0.1:3108'}})),'http://127.0.0.1:3108');}finally{if(saved===undefined)delete process.env.BONKERS_SITE_ORIGIN;else process.env.BONKERS_SITE_ORIGIN=saved;}});
