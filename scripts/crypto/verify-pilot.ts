/** Same real-wallet UI against a second LOCAL fork impersonating the owner. Never targets mainnet. */
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createPublicClient,createWalletClient,http,erc20Abi} from 'viem';
import {BASE_USDC} from '../../shared/crypto/assets';
const c=JSON.parse(await readFile('.data/crypto-lab/config.json','utf8'));
const rpc='http://127.0.0.1:8548';
const node=spawn('anvil',['--host','127.0.0.1','--port','8548','--chain-id','8453','--fork-url','http://127.0.0.1:8547'],{stdio:'ignore'});
let browser;
try{
 const client=createPublicClient({transport:http(rpc,{retryCount:0})});
 for(let i=0;;i++){try{await client.getChainId();break;}catch{if(i>30)throw Error('Fork failed');await new Promise(r=>setTimeout(r,250));}}
 assert((await client.request({method:'web3_clientVersion'})).toLowerCase().includes('anvil'));assert.equal(await client.getChainId(),8453);
 await client.request({method:'anvil_impersonateAccount',params:[c.player]} as never);
 // Exercise a different wallet from the previously hard-coded owner.
 const wallet=createWalletClient({transport:http(rpc)});const accounts=await wallet.getAddresses();const tester=accounts[1];assert(tester.toLowerCase()!==c.player.toLowerCase());
 const funded=await wallet.writeContract({account:c.player,chain:null,address:BASE_USDC,abi:erc20Abi,functionName:'transfer',args:[tester,100000000n]});
 assert.equal((await client.waitForTransactionReceipt({hash:funded})).status,'success');
 await client.request({method:'anvil_stopImpersonatingAccount',params:[c.player]} as never);c.player=tester;

 const before=await client.readContract({address:BASE_USDC,abi:erc20Abi,functionName:'balanceOf',args:[c.player]});
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript({content:'window.__name=(fn)=>fn;'});
 await page.addInitScript(({rpc,player})=>{(window as unknown as {ethereum:unknown}).ethereum={on:()=>{},removeListener:()=>{},request:async({method,params}:{method:string;params?:unknown[]})=>{if(method==='eth_requestAccounts'||method==='eth_accounts')return[player];if(method==='wallet_switchEthereumChain'){if((params?.[0] as {chainId:string}).chainId!=='0x2105')throw Error('Wrong network');return null;}const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:params??[]})});const d=await r.json();if(d.error)throw Error(d.error.message);return d.result;}};},{rpc,player:c.player});
 await page.goto('http://127.0.0.1:3107/crypto-pilot');await page.getByRole('button',{name:'Connect Base wallet',exact:true}).click();
 await page.getByRole('button',{name:'1. Deploy test contracts',exact:true}).click();
 await page.getByRole('button',{name:'2. Approve & fund (up to 85.01 USDC)',exact:true}).click();
 await page.getByRole('button',{name:'3. Deal a 5 USDC hand',exact:true}).click();
 const end=Date.now()+60000;while(Date.now()<end){if(await page.getByRole('button',{name:'Download verified round receipt',exact:true}).isEnabled())break;if(await page.getByRole('button',{name:'Stand',exact:true}).isEnabled())await page.getByRole('button',{name:'Stand',exact:true}).click();await page.waitForTimeout(200);}
 assert(await page.getByRole('button',{name:'Download verified round receipt',exact:true}).isEnabled(),await page.locator('.lab-status').innerText());
 await page.getByRole('button',{name:'Withdraw all unlocked funds to my wallet',exact:true}).click();
 await page.waitForFunction(()=>document.body.textContent?.includes('All player and house funds returned'),{},{timeout:60000});
 const after=await client.readContract({address:BASE_USDC,abi:erc20Abi,functionName:'balanceOf',args:[c.player]});assert.equal(after,before,'Owner receives every USDC back when acting as both house and player');assert.deepEqual(errors,[]);
 await page.screenshot({path:'docs/crypto/evidence/owner-pilot.png',fullPage:true});
 await writeFile('docs/crypto/evidence/owner-pilot.json',JSON.stringify({testedAt:new Date().toISOString(),execution:'LOCAL Anvil fork with chain ID 8453, not mainnet',wallet:c.player,before:String(before),after:String(after),browserErrors:errors},null,2));
 console.log('PASS: different-wallet mainnet UI deploy/fund/play/replay/withdraw on LOCAL fork. No mainnet transactions.');
}catch(error){if(browser){const page=browser.contexts()[0]?.pages()[0];if(page)console.error('UI:',await page.locator('.lab-status').innerText());}throw error;}finally{await browser?.close();node.kill('SIGTERM');}
