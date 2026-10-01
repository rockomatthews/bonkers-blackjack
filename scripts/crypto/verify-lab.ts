import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createPublicClient,http,erc20Abi} from 'viem';
import type {LabConfig} from '../../server/crypto/lab-types';
import {vaultAbi} from '../../shared/crypto/vault';
import {verifyCryptoReceipt} from '../../shared/crypto/verify-receipt';
const dir=process.env.CRYPTO_LAB_DIR??'.data/crypto-lab';
const c:LabConfig=JSON.parse(await readFile(`${dir}/config.json`,'utf8'));
if(c.chainId!==31337||new URL(c.rpc).hostname!=='127.0.0.1')throw Error('Only a local fork may be tested');
const client=createPublicClient({transport:http(c.rpc)});
if(await client.getChainId()!==31337||!(await client.request({method:'web3_clientVersion'})).toLowerCase().includes('anvil'))throw Error('Only Anvil is allowed');
const raw=(method:string,params:unknown[])=>client.request({method,params} as never);
await raw('anvil_impersonateAccount',[c.player]);
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080}});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript({content:'window.__name = (fn) => fn;'});
 await page.addInitScript(({rpc,player})=>{
  (window as unknown as {ethereum:unknown}).ethereum={
   on:()=>{},removeListener:()=>{},
   request:async({method,params}:{method:string;params?:unknown[]})=>{
    if(method==='eth_requestAccounts'||method==='eth_accounts')return [player];
    if(method==='wallet_switchEthereumChain'){if((params?.[0] as {chainId:string})?.chainId!=='0x7a69')throw Error('Wrong chain');return null;}
    if(method==='wallet_addEthereumChain')return null;
    const response=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:params??[]})});const data=await response.json();if(data.error)throw Error(data.error.message);return data.result;
   }
  };
 },{rpc:c.rpc,player:c.player});
 await page.goto('http://127.0.0.1:3107/crypto-lab');
 console.log('Injected provider:',await page.evaluate(()=>typeof (window as unknown as {ethereum:unknown}).ethereum),'errors:',errors);
 await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
 await page.waitForTimeout(1500);console.log('Connection status:',await page.locator('.lab-status').innerText());
 await page.getByRole('button',{name:'Approve & deposit',exact:true}).waitFor();
 const walletBefore=await client.readContract({address:c.token,abi:erc20Abi,functionName:'balanceOf',args:[c.player]});
 await page.getByRole('button',{name:'Approve & deposit',exact:true}).click();
 await page.waitForFunction(()=>document.body.textContent?.includes('AVAILABLE$100.000000'),{},{timeout:60000});
 await page.getByRole('button',{name:'Deal $5',exact:true}).click();
 const end=Date.now()+90000;
 while(Date.now()<end){
  if(await page.getByRole('button',{name:'Download verifiable receipt'}).isEnabled())break;
  if(await page.getByRole('button',{name:'Stand',exact:true}).isEnabled())await page.getByRole('button',{name:'Stand',exact:true}).click();
  await page.waitForTimeout(500);
 }
 assert(await page.getByRole('button',{name:'Download verifiable receipt'}).isEnabled(),'Receipt must be available');
 const latest=await (await fetch('http://127.0.0.1:3107/api/crypto/lab')).json();
 assert.equal(verifyCryptoReceipt(latest.round.receipt).valid,true);
 const afterRound=await client.readContract({address:c.vault,abi:vaultAbi,functionName:'available',args:[c.player]});
 assert.equal(afterRound,94990000n+BigInt(latest.round.receipt.payouts[0]));
 await page.getByLabel('Amount (USDC)').fill('10');await page.getByRole('button',{name:'Withdraw',exact:true}).click();
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Withdraw')?.disabled,{},{timeout:30000});
 const walletAfter=await client.readContract({address:c.token,abi:erc20Abi,functionName:'balanceOf',args:[c.player]});
 const vaultAfter=await client.readContract({address:c.vault,abi:vaultAbi,functionName:'available',args:[c.player]});
 assert.equal(walletAfter,walletBefore-90000000n);assert.equal(vaultAfter,afterRound-10000000n);
 const assets=await client.readContract({address:c.token,abi:erc20Abi,functionName:'balanceOf',args:[c.vault]});const accounted=await client.readContract({address:c.vault,abi:vaultAbi,functionName:'accountedAssets'});assert.equal(assets,accounted);
 assert.deepEqual(errors,[]);
 await mkdir('docs/crypto/evidence',{recursive:true});await page.screenshot({path:'docs/crypto/evidence/local-fork-cashier.png',fullPage:true});
 const evidence={verifiedAt:new Date().toISOString(),chainId:31337,forkBlock:c.forkBlock,game:c.game,vault:c.vault,deposit:'100 USDC',withdrawal:'10 USDC',receipt:latest.round.receipt,assets:assets.toString(),accounted:accounted.toString(),browserErrors:errors};
 await writeFile('docs/crypto/evidence/local-fork-flow.json',JSON.stringify(evidence,null,2));console.log('PASS: browser wallet connection → approval → deposit → wager → verified settlement → withdrawal. Local fork only.');
}finally{await browser.close();await raw('anvil_stopImpersonatingAccount',[c.player]);}
