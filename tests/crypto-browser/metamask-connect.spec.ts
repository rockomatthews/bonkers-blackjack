import {test,expect,devices,type Page} from '@playwright/test';
import {privateKeyToAccount} from 'viem/accounts';
import {verifyMessage,type Hex} from 'viem';
import {BASE_USDC} from '../../shared/crypto/assets';
import {walletLoginMessage} from '../../shared/crypto/house';
const account=privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
async function mockMetaMask(page:Page,startChain='0x2105',existing?:string){
 let chain=startChain,loggedIn=false;const calls:string[]=[];
 await page.route('**/api/house/table',r=>r.fulfill({json:[]}));
 await page.route('**/api/house/balances',r=>r.fulfill({json:{account:account.address,chainId:8453,token:BASE_USDC,wallet:'42000000',available:'10000000',locked:'0',house:'75000000',reserved:'0',fees:'0',assets:'85000000',accounted:'85000000',block:'1'}}));
 await page.route('**/api/house/session',r=>{const owner=loggedIn?account.address:existing;return r.fulfill({status:owner?200:401,json:owner?{owner}:{error:'Reconnect your wallet'}});});
 await page.route('**/api/house/status',r=>r.fulfill({json:{house:account.address,depositsOpen:false,dealerReady:false,reason:'Deposits closed.'}}));
 await page.route('**/api/house/challenge',r=>r.fulfill({json:{nonce:'testnonce',message:walletLoginMessage('http://127.0.0.1:3108',account.address,'testnonce',new Date('2026-10-18T00:00:00Z'),new Date('2026-10-18T00:10:00Z'))}}));
 await page.route('**/api/house/login',async r=>{const b=r.request().postDataJSON();expect(await verifyMessage({address:account.address,message:walletLoginMessage('http://127.0.0.1:3108',account.address,b.nonce,new Date('2026-10-18T00:00:00Z'),new Date('2026-10-18T00:10:00Z')),signature:b.signature})).toBe(true);loggedIn=true;await r.fulfill({json:{connected:true}});});
 await page.route('**/api/house/round',r=>r.fulfill({json:null}));
 await page.exposeFunction('metaMaskRequest',async({method,params}:{method:string;params:unknown[]})=>{calls.push(method);if(method==='eth_requestAccounts'||method==='eth_accounts')return[account.address];if(method==='eth_chainId')return chain;if(method==='wallet_switchEthereumChain'){chain=(params[0] as {chainId:string}).chainId;return null;}if(method==='personal_sign'){expect(calls).not.toContain('eth_blockNumber');return account.signMessage({message:{raw:params[0] as Hex}});}throw Error('Simulated unavailable balance RPC');});
 await page.addInitScript(()=>{const w=window as unknown as {ethereum:unknown;metaMaskRequest:(r:unknown)=>Promise<unknown>;emitWalletEvent:(event:string,payload:unknown)=>void};const events=new Map<string,Set<(payload:unknown)=>void>>();const provider={isMetaMask:true,request:(r:unknown)=>w.metaMaskRequest(r),on(event:string,fn:(p:unknown)=>void){if(!events.has(event))events.set(event,new Set());events.get(event)!.add(fn);},removeListener(event:string,fn:(p:unknown)=>void){events.get(event)?.delete(fn);}};w.ethereum=provider;w.emitWalletEvent=(event,payload)=>events.get(event)?.forEach(fn=>fn(payload));window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'metamask-local',name:'MetaMask',rdns:'io.metamask'},provider}})));});
 return calls;
}
for(const mobile of [false,true])test(`MetaMask ${mobile?'mobile browser':'desktop'} signs in despite failed balance RPC and duplicate wallet events`,async({browser})=>{
 const context=await browser.newContext(mobile?devices['iPhone 13']:{});const page=await context.newPage();const calls=await mockMetaMask(page);await page.goto('/house');await page.getByRole('button',{name:'Choose wallet',exact:true}).click();await page.getByRole('button',{name:'MetaMask',exact:true}).click();const controls=page.getByRole('dialog',{name:'House controls'});await expect(controls).toBeVisible();await expect(controls.getByRole('status')).toContainText('House wallet signed in');await expect(controls.getByText('42.00',{exact:true})).toBeVisible();expect(calls).not.toContain('wallet_switchEthereumChain');await page.evaluate(address=>{const w=window as unknown as {emitWalletEvent:(e:string,p:unknown)=>void};w.emitWalletEvent('chainChanged','0x2105');w.emitWalletEvent('accountsChanged',[address.toLowerCase()]);},account.address);await expect(controls).toBeVisible();await controls.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('button',{name:'House ledger',exact:true})).toBeVisible();await page.evaluate(()=>{(window as unknown as {emitWalletEvent:(e:string,p:unknown)=>void}).emitWalletEvent('accountsChanged',['0x0000000000000000000000000000000000000001']);});await expect(page.getByRole('button',{name:'House ledger',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Choose wallet',exact:true})).toBeVisible();await context.close();
});
test('MetaMask switches to Base only when needed before signing',async({page})=>{const calls=await mockMetaMask(page,'0x1');await page.goto('/live/bonkers-room?connect=1');await page.getByRole('button',{name:'MetaMask',exact:true}).click();await expect(page.getByRole('button',{name:'Cashier',exact:true})).toBeEnabled();expect(calls.filter(m=>m==='wallet_switchEthereumChain')).toHaveLength(1);expect(calls.indexOf('wallet_switchEthereumChain')).toBeLessThan(calls.indexOf('personal_sign'));});
test('mobile browser without an injected wallet offers MetaMask app handoff preserving the game',async({browser})=>{const context=await browser.newContext(devices['iPhone 13']);const page=await context.newPage();await page.goto('/toin-coss?connect=1');const chooser=page.getByRole('dialog',{name:'Connect wallet'});await expect(chooser).toBeVisible();await expect(chooser.getByRole('link',{name:'Open in MetaMask app'})).toHaveAttribute('href','https://link.metamask.io/dapp/127.0.0.1:3108/toin-coss?connect=1');await context.close();});

test('existing signed-in session skips another signature only for the same connected address',async({browser})=>{for(const existing of [account.address,'0x0000000000000000000000000000000000000001']){const context=await browser.newContext();const page=await context.newPage();const calls=await mockMetaMask(page,'0x2105',existing);await page.goto('/live/bonkers-room?connect=1');await page.getByRole('button',{name:'MetaMask',exact:true}).click();await expect(page.getByRole('button',{name:'Cashier',exact:true})).toBeEnabled();expect(calls.includes('personal_sign')).toBe(existing!==account.address);await context.close();}});

test('cards remain visible and cashier usable while an independent dealer update is delayed',async({page})=>{
 await mockMetaMask(page);const{replayEngine}=await import('../../shared/crypto/engines');const engine=replayEngine(2),seed=('0x'+'12'.repeat(32)) as Hex,entropy=('0x'+'34'.repeat(32)) as Hex,model=engine.initial(engine.shuffle(seed,entropy),1);const r={id:seed,commitment:entropy,phase:2,deadline:String(Math.floor(Date.now()/1000)+60),players:[account.address],stakes:['1000000'],wager:'1000000',seat:3,observedBlock:'100',actionCount:0,state:engine.publicState(model),observation:engine.observation(model)};let release!:()=>void,requested=false;const gate=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/house/table',route=>route.fulfill({json:[r]}));await page.route('**/api/house/progress',async route=>{requested=true;await gate;await route.fulfill({json:{...r,phase:3,observedBlock:'101'}});});await page.goto('/live/bonkers-room?connect=1');await page.getByRole('button',{name:'MetaMask',exact:true}).click();await expect(page.getByTestId('bet-seat-3').locator('.live-card')).toHaveCount(2);await expect.poll(()=>requested).toBe(true);await expect(page.getByRole('button',{name:'Cashier',exact:true})).toBeEnabled();await expect(page.getByTestId('bet-seat-3').locator('.live-card').first()).toBeVisible();release();await page.unroute('**/api/house/progress');
});

test('mobile table taps accumulate the selected chips and Clear removes the whole staged layout',async({browser})=>{const context=await browser.newContext(devices['iPhone 13']);const page=await context.newPage();await mockMetaMask(page);await page.goto('/live/bonkers-room?connect=1');await page.getByRole('button',{name:'MetaMask',exact:true}).click();await expect(page.getByRole('button',{name:'Cashier',exact:true})).toBeEnabled();await page.getByTestId('bet-seat-0').click();await page.getByTestId('bet-seat-0').click();await expect(page.getByTestId('bet-seat-0').getByText('$2',{exact:true})).toBeVisible();await page.getByRole('button',{name:'$5 chip',exact:true}).click();await page.getByTestId('bet-seat-6').click();await expect(page.getByTestId('bet-seat-6').getByText('$5',{exact:true}).last()).toBeVisible();await expect(page.getByText('Staged: $7 across 2 seats',{exact:false})).toBeVisible();await page.screenshot({path:'docs/screenshots/multi-seat-staged-390-local.png'});await page.getByRole('button',{name:'Clear',exact:true}).click();await expect(page.getByText('Staged: $0 across 0 seats',{exact:false})).toBeVisible();await context.close();});

for(const mobile of [false,true])test(`confirmed player cards replace stale staged chips after delayed confirmation on ${mobile?'mobile':'desktop'}`,async({browser})=>{
 const context=await browser.newContext(mobile?devices['iPhone 13']:{}),page=await context.newPage();await mockMetaMask(page);
 const{replayEngine}=await import('../../shared/crypto/engines');const engine=replayEngine(2),seed=('0x'+'56'.repeat(32)) as Hex,entropy=('0x'+'78'.repeat(32)) as Hex,model=engine.initial(engine.shuffle(seed,entropy),1);
 const round={id:seed,commitment:entropy,phase:3,deadline:String(Math.floor(Date.now()/1000)+60),players:[account.address],stakes:['2000000'],wager:'2000000',seat:3,observedBlock:'200',actionCount:0,state:engine.publicState(model),observation:engine.observation(model)};
 let joined=false;await page.route('**/api/house/table',r=>r.fulfill({json:joined?[round]:[]}));
 await page.goto('/live/bonkers-room?connect=1');await page.getByRole('button',{name:'MetaMask',exact:true}).click();await expect(page.getByRole('button',{name:'Cashier',exact:true})).toBeEnabled();
 const seat=page.getByTestId('bet-seat-3');await seat.click();await seat.click();await expect(seat.locator('.placed-chip')).toHaveCount(2);
 // The wager reached the chain even though its wallet confirmation did not reach the UI.
 joined=true;
 await expect(page.getByRole('button',{name:'Stand',exact:true})).toBeVisible();await expect(seat.locator('.live-card')).toHaveCount(2);await expect(seat.locator('.live-card').first()).toBeVisible();await expect(seat.locator('.placed-chip')).toHaveCount(0);await expect(page.getByText('Staged: $0 across 0 seats',{exact:false})).toBeVisible();
 await page.screenshot({path:`docs/screenshots/confirmed-cards-${mobile?'mobile':'desktop'}.png`});await context.close();
});

test('quick play approval opens automatically for players and Deal cannot fall back to repeated wallet transactions',async({page})=>{
 const calls=await mockMetaMask(page);await page.route('**/api/house/status',r=>r.fulfill({json:{house:'0x0000000000000000000000000000000000000001',deployment:{game:'0x0000000000000000000000000000000000000002',vault:'0x0000000000000000000000000000000000000003'},depositsOpen:true,dealerReady:true,wagersOpen:true,freeCollateral:'75000000',reason:'Ready'}}));
 await page.goto('/live/bonkers-room?connect=1');await page.getByRole('button',{name:'MetaMask',exact:true}).click();const approval=page.getByRole('dialog',{name:'Bring money to the table'});await expect(approval).toBeVisible();await expect(approval).toContainText('How much would you like to bring to the table?');expect(calls).not.toContain('eth_sendTransaction');await approval.getByRole('button',{name:'Close',exact:true}).click();await page.getByTestId('bet-seat-3').click();await page.getByRole('button',{name:'Deal',exact:true}).click();await expect(approval).toBeVisible();expect(calls).not.toContain('eth_sendTransaction');await expect(page.getByTestId('bet-seat-3').locator('.placed-chip')).toHaveCount(1);
});

test('homepage login stays on the homepage and restores wallet in the chosen game with an empty dealer',async({page})=>{
 const calls=await mockMetaMask(page);await page.route('**/api/house/status',r=>r.fulfill({json:{house:'0x0000000000000000000000000000000000000001',deployment:{game:'0x0000000000000000000000000000000000000002',vault:'0x0000000000000000000000000000000000000003'},depositsOpen:true,dealerReady:true,wagersOpen:true,freeCollateral:'75000000',reason:'Ready'}}));
 // A finished historical hand must not appear as a newly dealt hand on room entry.
 await page.route('**/api/house/table',r=>r.fulfill({json:[{id:'0x'+'12'.repeat(32),phase:5,seat:3,players:[account.address],stakes:['2000000'],state:{seats:[{hands:[{cards:[1,2],multiplier:1,done:true}]}],dealer:[3,4],done:true},deadline:'1',observedBlock:'100'}]}));
 await page.goto('/');await page.getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'MetaMask',exact:true}).click();await expect(page.getByRole('button',{name:/Cashier/})).toBeVisible();await expect(page).toHaveURL(/\/$/);await expect(page.getByRole('dialog',{name:'Bring money to the table'})).toHaveCount(0);
 await page.getByRole('link',{name:'Play Blackjack',exact:true}).click();await page.getByRole('link',{name:'Enter The Bonkers Room',exact:true}).click();const entry=page.getByRole('dialog',{name:'Bring money to the table'});await expect(entry).toBeVisible();await entry.getByRole('button',{name:'Close',exact:true}).click();await expect(page.locator('.live-dealer .live-card')).toHaveCount(0);await expect(page.getByTestId('bet-seat-3').locator('.live-card')).toHaveCount(0);await expect(page.getByRole('button',{name:'Stand',exact:true})).toHaveCount(0);expect(calls.filter(m=>m==='personal_sign')).toHaveLength(1);
});

for(const mobile of [false,true])test(`both occupied seats stay visible with distinct totals and automatic turn focus on ${mobile?'mobile':'desktop'}`,async({browser})=>{
 const context=await browser.newContext(mobile?devices['iPhone 13']:{}),page=await context.newPage();await mockMetaMask(page);
 const {replayEngine}=await import('../../shared/crypto/engines');const engine=replayEngine(2),seed=('0x'+'12'.repeat(32)) as Hex,entropy=('0x'+'34'.repeat(32)) as Hex,model=engine.initial(engine.shuffle(seed,entropy),1);
 let phase=3;const rows=()=>[2,3].map(seat=>({id:'0x'+String(seat).repeat(64),commitment:entropy,phase:seat===3?phase:3,deadline:String(Math.floor(Date.now()/1000)+60),players:[account.address],stakes:['2000000'],seat,observedBlock:String(phase===3?100:phase===2?101:102),state:engine.publicState(model),observation:engine.observation(model)}));
 await page.route('**/api/house/table',r=>r.fulfill({json:rows()}));await page.route('**/api/house/progress',r=>r.fulfill({json:rows()[1]}));
 await page.goto('/live/bonkers-room?connect=1');await page.getByRole('button',{name:'MetaMask',exact:true}).click();
 for(const seat of [2,3]){const spot=page.getByTestId('bet-seat-'+seat);await expect(spot.locator('.live-card')).toHaveCount(2);await expect(spot.locator('.live-hand-total')).toBeVisible();const sizes=await spot.evaluate(el=>[parseFloat(getComputedStyle(el.querySelector('.live-hand-total')!).fontSize),parseFloat(getComputedStyle(el.querySelector('.live-seat-number')!).fontSize)]);expect(sizes[0]).toBeGreaterThan(sizes[1]*2);}
 await expect(page.getByRole('button',{name:'Resume / recover round',exact:true})).toHaveCount(0);
 // Hitting should keep the selected hand focused while its next cards arrive, even if another hand is ready.
 phase=2;await expect(page.getByTestId('bet-seat-3')).toHaveClass(/focused/);await page.waitForTimeout(2100);await expect(page.getByTestId('bet-seat-3')).toHaveClass(/focused/);
 phase=4;await expect(page.getByTestId('bet-seat-2')).toHaveClass(/focused/);await expect(page.getByRole('button',{name:'Stand',exact:true})).toBeVisible();
 await page.screenshot({path:`/tmp/bonkers-two-hands-${mobile?'mobile':'desktop'}.png`});await context.close();
});

test('house and player logins remain isolated in tabs sharing browser cookies',async({context})=>{
 const {generatePrivateKey,privateKeyToAccount}=await import('viem/accounts');
 const accounts=[privateKeyToAccount(generatePrivateKey()),privateKeyToAccount(generatePrivateKey())];
 const origin='http://127.0.0.1:3108';
 for(const a of accounts){
  const c=await context.request.post('/api/house/challenge',{headers:{origin},data:{owner:a.address}});expect(c.status()).toBe(200);
  const challenge=await c.json(),signature=await a.signMessage({message:challenge.message});
  const login=await context.request.post('/api/house/login',{headers:{origin},data:{owner:a.address,nonce:challenge.nonce,signature}});expect(login.status()).toBe(200);
 }
 // The second login replaced the legacy cookie, but each tab selects its own verified cookie.
 for(const a of accounts){
  const result=await context.request.get('/api/house/session',{headers:{'X-Bonkers-Wallet':a.address}});
  expect(result.status()).toBe(200);expect((await result.json()).owner.toLowerCase()).toBe(a.address.toLowerCase());
 }
 const stranger=privateKeyToAccount(generatePrivateKey());
 expect((await context.request.get('/api/house/session',{headers:{'X-Bonkers-Wallet':stranger.address}})).status()).toBe(401);
 const cookies=await context.cookies();expect(cookies.filter(c=>c.name.startsWith('bonkers-wallet-'))).toHaveLength(2);
 expect(cookies.filter(c=>c.name.startsWith('bonkers-wallet')).every(c=>c.httpOnly&&c.sameSite==='Strict')).toBe(true);
});

test('the connected wallet selector accompanies cashier and gameplay requests',async({page})=>{
 await mockMetaMask(page);let selected:string|undefined;
 await page.route('**/api/house/balances',r=>{selected=r.request().headers()['x-bonkers-wallet'];return r.fulfill({json:{account:account.address,chainId:8453,token:BASE_USDC,wallet:'42000000',available:'10000000',locked:'0',house:'75000000',reserved:'0',fees:'0',assets:'85000000',accounted:'85000000',block:'1'}});});
 await page.goto('/live/bonkers-room?connect=1');await page.getByRole('button',{name:'MetaMask',exact:true}).click();
 await expect.poll(()=>selected).toBe(account.address.toLowerCase());
});
