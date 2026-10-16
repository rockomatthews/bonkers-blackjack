import {test,expect} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createPublicClient,createWalletClient,http,defineChain,parseAbi,type Address,type Hex} from 'viem';
import {BASE_USDC} from '../../shared/crypto/assets';
import {gameAbi} from '../../shared/crypto/game-abi';
import {vaultAbi} from '../../shared/crypto/vault';
import {verifyCryptoReceipt} from '../../shared/crypto/verify-receipt';

const rpc='http://127.0.0.1:18550';
const chain=defineChain({id:8453,name:'LOCAL wallet UI verification',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpc]}}});
const client=createPublicClient({chain,transport:http(rpc,{retryCount:0}),pollingInterval:50});
const wallet=createWalletClient({chain,transport:http(rpc)});
const tokenAbi=parseAbi(['function mint(address,uint256)','function balanceOf(address) view returns(uint256)']);
let child:ChildProcess,player:Address;
test.beforeAll(async()=>{
 child=spawn('anvil',['--host','127.0.0.1','--port','18550','--chain-id','8453','--silent'],{stdio:'ignore'});
 for(let n=0;;n++){await new Promise(r=>setTimeout(r,100));if(child.exitCode!==null)throw Error('Fresh local Anvil failed; refusing existing RPC');try{await client.getChainId();break;}catch{if(n>50)throw Error('Anvil startup timeout');}}
 assert.match(await client.request({method:'web3_clientVersion'}),/anvil/i);assert.equal(await client.getChainId(),8453);
 const accounts=await wallet.getAddresses();player=accounts[1];
 const mock=JSON.parse(await readFile('contracts/out/PlayerVault.t.sol/VaultToken.json','utf8'));
 await client.request({method:'anvil_setCode',params:[BASE_USDC,mock.deployedBytecode.object]} as never);
 const tx=await wallet.writeContract({account:accounts[0],address:BASE_USDC,abi:tokenAbi,functionName:'mint',args:[player,1000000000n]});
 assert.equal((await client.waitForTransactionReceipt({hash:tx})).status,'success');
});
test.afterAll(()=>child?.kill('SIGTERM'));

test('live lobby has full-card entrances and no simulated balance or direction buttons',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'A little mad. All blackjack.'})).toBeVisible();
 await expect(page.getByText(/PLAY-MONEY|PLAY USDC|No real deposits|Simulate incoming/)).toHaveCount(0);
 await expect(page.locator('button svg.lucide-arrow-up-right, .round-button')).toHaveCount(0);
 const rooms=[['The Bonkers Room','bonkers-room'],['Midnight Lounge','midnight-lounge'],['Carnival Club','high-society']];
 await page.screenshot({path:'docs/screenshots/live-lobby-desktop.png',fullPage:true});
 for(const [name,id] of rooms){await page.goto('/');const card=page.getByRole('link',{name:'Enter '+name,exact:true});await expect(card).toHaveAttribute('href','/live/'+id);await card.click({position:{x:25,y:25}});await expect(page).toHaveURL('/live/'+id);await expect(page.locator('.live-backdrop')).toBeVisible();await expect(page.getByTestId('player-balance')).toHaveText('— USDC');}
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.screenshot({path:'docs/screenshots/live-lobby-mobile.png',fullPage:true});
});

test('wallet table deposits, settles, verifies house fee and withdraws on LOCAL mock Base',async({page})=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('bonkersLocalWalletRpc',async({method,params}:{method:string;params:unknown[]})=>{
  if(method==='eth_requestAccounts'||method==='eth_accounts')return[player];
  if(method==='wallet_switchEthereumChain'){assert.equal((params[0] as {chainId:string}).chainId,'0x2105');return null;}
  if(method==='eth_sendTransaction')assert.equal((params[0] as {from:string}).from.toLowerCase(),player.toLowerCase());
  return client.request({method,params} as never);
 });
 await page.addInitScript(()=>{
  const w=window as unknown as {ethereum:unknown;bonkersLocalWalletRpc:(r:unknown)=>Promise<unknown>};
  w.ethereum={request:(r:unknown)=>w.bonkersLocalWalletRpc(r),on(){},removeListener(){}};
 });
 await page.goto('/live/midnight-lounge');
 await page.locator('.live-table-header').getByRole('button',{name:'Connect wallet',exact:true}).click();
 const cashier=page.getByRole('dialog',{name:'USDC cashier'});await expect(cashier).toBeVisible();
 await cashier.getByRole('button',{name:'Create wallet table',exact:true}).click();
 await expect(cashier.getByRole('status')).toContainText('deployed on Base',{timeout:60000});
 const saved=await page.evaluate(p=>JSON.parse(localStorage.getItem(`bonkers-wallet-pilot-v2:${p.toLowerCase()}`)!),player);
 const {game,vault}=saved.deployment;
 assert.equal(await client.readContract({address:game,abi:gameAbi,functionName:'rulesVersion'}),2);
 await cashier.getByRole('button',{name:'Fund house reserve up to 75 USDC',exact:true}).click();
 await expect(cashier.getByRole('status')).toContainText('House reserve funded',{timeout:60000});
 await cashier.getByLabel('Player deposit (USDC)').fill('42.51');
 await cashier.getByRole('button',{name:'Approve & deposit USDC',exact:true}).click();
 await expect(cashier.getByRole('status')).toContainText('Deposit confirmed on Base',{timeout:60000});
 assert.equal(await client.readContract({address:vault,abi:vaultAbi,functionName:'available',args:[player]}),42510000n);
 await cashier.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.getByTestId('player-balance')).toHaveText('42.51 USDC');
 await page.getByRole('button',{name:'Deal 5 USDC',exact:true}).click();
 for(let turn=0;turn<20;turn++){
  await expect.poll(async()=>{
   if((await page.locator('.live-message').innerText()).includes('Round settled on Base'))return 'done';
   for(const label of ['No insurance','Stand'])if(await page.getByRole('button',{name:label,exact:true}).and(page.locator('button:enabled')).count())return label;
   return 'waiting';
  },{timeout:45000}).not.toBe('waiting');
  if((await page.locator('.live-message').innerText()).includes('Round settled on Base'))break;
  const decline=page.getByRole('button',{name:'No insurance',exact:true}).and(page.locator('button:enabled'));
  if(await decline.count())await decline.click();else await page.getByRole('button',{name:'Stand',exact:true}).click();
 }
 await expect(page.locator('.live-message')).toContainText('Round settled on Base');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download receipt',exact:true}).click()]);
 const file=await download.path();const proof=JSON.parse(await readFile(file!,'utf8'));assert.equal(verifyCryptoReceipt(proof).valid,true);
 const payout=BigInt(proof.payouts[0]);
 const [house,fees,available,accounted,assets]=await Promise.all([
  client.readContract({address:vault,abi:vaultAbi,functionName:'house'}),client.readContract({address:vault,abi:vaultAbi,functionName:'feeRevenue'}),client.readContract({address:vault,abi:vaultAbi,functionName:'available',args:[player]}),client.readContract({address:vault,abi:vaultAbi,functionName:'accountedAssets'}),client.readContract({address:BASE_USDC,abi:tokenAbi,functionName:'balanceOf',args:[vault]})]);
 assert.equal(house,75000000n+5010000n-payout);assert.equal(fees,10000n);assert.equal(available,42510000n-5010000n+payout);assert.equal(accounted,assets);
 await page.getByRole('button',{name:'House ledger',exact:true}).click();const ledger=page.getByRole('dialog',{name:'House ledger'});
 await expect(ledger.getByTestId('house-fees')).toHaveText('0.01 USDC');await expect(ledger.getByTestId('ledger-integrity')).toContainText('matches accounted');
 await expect(ledger.getByText('On-chain table fee:',{exact:false})).toContainText('0.01 USDC');
 await page.screenshot({path:'docs/screenshots/live-house-ledger-local.png'});await ledger.getByRole('button',{name:'Close',exact:true}).click();
 for(const size of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(size);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);await page.locator('.live-backdrop').evaluate((img:HTMLImageElement)=>img.decode());await page.screenshot({path:`docs/screenshots/live-wallet-table-${size.width}.png`});}
 await page.locator('.live-table-header').getByRole('button',{name:'Cashier',exact:true}).click();
 await cashier.getByRole('button',{name:'Withdraw all unlocked player and house funds',exact:true}).click();
 await expect(cashier.getByRole('status')).toContainText('All player and house funds returned',{timeout:60000});
 assert.equal(await client.readContract({address:BASE_USDC,abi:tokenAbi,functionName:'balanceOf',args:[player]}),1000000000n);
 assert.equal(await client.readContract({address:vault,abi:vaultAbi,functionName:'accountedAssets'}),0n);
 assert.equal(await client.readContract({address:BASE_USDC,abi:tokenAbi,functionName:'balanceOf',args:[vault]}),0n);
 assert.deepEqual(errors,[]);
 await mkdir('docs/crypto/evidence',{recursive:true});await writeFile('docs/crypto/evidence/live-wallet-ui-local.json',JSON.stringify({network:'LOCAL Anvil with chain ID 8453 and mock USDC at the native token address; NOT live Base',mainnetTransactions:0,game,vault,deposit:'42.51 USDC',houseFunding:'75 USDC',fee:'0.01 USDC',payout:String(payout),houseBeforeWithdrawal:String(house),playerBeforeWithdrawal:String(available),settlementHash:proof.settlementHash,receiptVerified:true,allFundsWithdrawn:true,browserErrors:errors},null,2)+'\n');
});
