'use client';
import {useEffect,useState,useRef} from 'react';
import {createPublicClient,createWalletClient,custom,erc20Abi,parseAbi,encodeAbiParameters,keccak256,type EIP1193Provider,type Address,type Hex} from 'viem';
import {base} from 'viem/chains';
import {BASE_USDC} from '../../shared/crypto/assets';
import {gameAbi} from '../../shared/crypto/game-abi';
import {vaultAbi} from '../../shared/crypto/vault';
import {formatUSDC,parseUSDC,wagerFee} from '../../shared/crypto/money';
import {extraStake,total,type CryptoState} from '../../shared/crypto/replay';
import {replayEngine} from '../../shared/crypto/engines';
import {actionOptions} from '../../shared/crypto/actions';
import artifact from '../../shared/crypto/pilot-artifact.json';
import {verifyCryptoReceipt} from '../../shared/crypto/verify-receipt';
import type {LabReceipt} from '../../server/crypto/lab-types';
import Link from 'next/link';
import Image from 'next/image';
import {roomArt,type RoomId} from '../../shared/rooms';
import LiveCard from '../../src/LiveCards';
import WalletDialog from '../../src/WalletDialog';
import '../../src/live.css';
const treasuryAbi=parseAbi(['function treasury() view returns(address)','function house() view returns(uint256)','function reserved() view returns(uint256)','function paused() view returns(bool)','function fundHouse(uint256)','function withdrawProfit(uint256)','function setPaused(bool)']);
type Deployment={game:Address;vault:Address;block:string;rulesVersion?:1|2};type Secret={id:Hex;seed:Hex;commitment:Hex};
const random=()=>`0x${Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('')}` as Hex;
const provider=()=>{const p=(window as unknown as {ethereum?:EIP1193Provider}).ethereum;if(!p)throw Error('Open this page in a browser with your wallet extension.');return p;};
export default function Pilot({roomId="bonkers-room"}:{roomId?:RoomId}){
 const [owner,setOwner]=useState<Address>(),[deployment,setDeployment]=useState<Deployment>(),[secret,setSecret]=useState<Secret>(),[state,setState]=useState<CryptoState>(),[phase,setPhase]=useState(0),[balance,setBalance]=useState({wallet:'',available:'',house:'',reserved:'',fees:'',locked:'',accounted:'',assets:'',block:''}),[busy,setBusy]=useState(''),[message,setMessage]=useState('Connect your wallet to use native USDC on Base.'),[receipt,setReceipt]=useState<LabReceipt>(),[tx,setTx]=useState<Hex>();
 const [cashier,setCashier]=useState(false),[ledger,setLedger]=useState(false),[depositAmount,setDepositAmount]=useState('42.51'),[recordedFee,setRecordedFee]=useState<string>();
 const running=useRef(false);
 const room=roomArt(roomId);
 const display=(value:string)=>value===''?'—':formatUSDC(BigInt(value)).replace(/(\.\d{2})0+$/, '$1');
 const engine=replayEngine(deployment?.rulesVersion??1);
 const playerFunding=!deployment||deployment.rulesVersion===2?42510000n:10010000n;
 const storageKey=(account:Address)=>`bonkers-wallet-pilot-v2:${account.toLowerCase()}`;
 useEffect(()=>{const p=(window as unknown as {ethereum?:EIP1193Provider}).ethereum;const reset=()=>{setOwner(undefined);setDeployment(undefined);setSecret(undefined);setState(undefined);setReceipt(undefined);setPhase(0);setBalance({wallet:'',available:'',house:'',reserved:'',fees:'',locked:'',accounted:'',assets:'',block:''});setMessage('Wallet changed. Reconnect to load that wallet’s test.');};p?.on?.('accountsChanged',reset);p?.on?.('chainChanged',reset);return()=>{p?.removeListener?.('accountsChanged',reset);p?.removeListener?.('chainChanged',reset);};},[]);
 function save(d:Deployment,s?:Secret){if(!owner)throw Error("Connect a wallet first");localStorage.setItem(storageKey(owner),JSON.stringify({deployment:d,secret:s}));setDeployment(d);setSecret(s);}
 async function clients(){const p=provider(),wallet=createWalletClient({chain:base,transport:custom(p)}),client=createPublicClient({chain:base,transport:custom(p),pollingInterval:500});if(await wallet.getChainId()!==8453)throw Error('Switch to Base mainnet before continuing.');const [account]=await wallet.getAddresses();if(!account)throw Error('Connect a wallet first');if(owner&&account.toLowerCase()!==owner.toLowerCase())throw Error('Wallet changed; reconnect before signing');return{wallet,client,account};}
 async function run(label:string,fn:()=>Promise<void>){if(running.current)return;running.current=true;setBusy(label);try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'Operation failed');}finally{running.current=false;setBusy('');}}
 async function readBalances(d:Deployment|null|undefined=deployment){
  const {client,account}=await clients();const blockNumber=await client.getBlockNumber();
  const wallet=await client.readContract({address:BASE_USDC,abi:erc20Abi,functionName:'balanceOf',args:[account],blockNumber});
  if(!d){setBalance(b=>({...b,wallet:String(wallet),block:String(blockNumber)}));return;}
  const [available,house,reserved,fees,locked,accounted,assets,treasury,token,gameVault]=await Promise.all([
   client.readContract({address:d.vault,abi:vaultAbi,functionName:'available',args:[account],blockNumber}),
   client.readContract({address:d.vault,abi:vaultAbi,functionName:'house',blockNumber}),
   client.readContract({address:d.vault,abi:vaultAbi,functionName:'reserved',blockNumber}),
   client.readContract({address:d.vault,abi:vaultAbi,functionName:'feeRevenue',blockNumber}),
   client.readContract({address:d.vault,abi:vaultAbi,functionName:'playerLocked',blockNumber}),
   client.readContract({address:d.vault,abi:vaultAbi,functionName:'accountedAssets',blockNumber}),
   client.readContract({address:BASE_USDC,abi:erc20Abi,functionName:'balanceOf',args:[d.vault],blockNumber}),
   client.readContract({address:d.vault,abi:treasuryAbi,functionName:'treasury',blockNumber}),
   client.readContract({address:d.vault,abi:vaultAbi,functionName:'token',blockNumber}),
   client.readContract({address:d.game,abi:gameAbi,functionName:'vault',blockNumber})]);
  if(treasury.toLowerCase()!==account.toLowerCase()||token.toLowerCase()!==BASE_USDC.toLowerCase()||gameVault.toLowerCase()!==d.vault.toLowerCase())throw Error('Saved table wallet, vault, or USDC contract does not match.');
  setBalance({wallet:String(wallet),available:String(available),house:String(house),reserved:String(reserved),fees:String(fees),locked:String(locked),accounted:String(accounted),assets:String(assets),block:String(blockNumber)});
 }
 async function send(args:Record<string,unknown>){const {wallet,client,account}=await clients();const hash=await wallet.writeContract({...args,account} as Parameters<typeof wallet.writeContract>[0]);setTx(hash);const result=await client.waitForTransactionReceipt({hash});if(result.status!=='success')throw Error('Transaction reverted. Refresh state before retrying.');return hash;}
 async function connect(){await run('Connect Base wallet',async()=>{await provider().request({method:'eth_requestAccounts'});try{await provider().request({method:'wallet_switchEthereumChain',params:[{chainId:'0x2105'}]});}catch{await provider().request({method:'wallet_addEthereumChain',params:[{chainId:'0x2105',chainName:'Base',nativeCurrency:base.nativeCurrency,rpcUrls:['https://mainnet.base.org'],blockExplorerUrls:['https://basescan.org']}]});await provider().request({method:'wallet_switchEthereumChain',params:[{chainId:'0x2105'}]});}const {account}=await clients();setOwner(account);let saved:{deployment:Deployment;secret?:Secret}|null=null;try{saved=JSON.parse(localStorage.getItem(storageKey(account))??'null');if(!saved){const legacy=JSON.parse(localStorage.getItem('bonkers-owner-pilot-v1')??'null');if(legacy?.deployment){const {client}=await clients();const treasury=await client.readContract({address:legacy.deployment.vault,abi:treasuryAbi,functionName:'treasury'});if(treasury.toLowerCase()===account.toLowerCase())saved=legacy;}}}catch{}setDeployment(saved?.deployment);setSecret(saved?.secret);await readBalances(saved?.deployment??null);setCashier(true);setMessage('Wallet connected to Base. Set up your table and deposit USDC in the cashier.');});}
 async function deploy(){await run('Create wallet table',async()=>{const {wallet,client,account}=await clients();const args=[BASE_USDC,account,account];
 const hash=await wallet.deployContract({account,abi:artifact.abi,bytecode:artifact.bytecode as Hex,args});setTx(hash);const result=await client.waitForTransactionReceipt({hash});if(result.status!=='success'||!result.contractAddress)throw Error('Deployment failed');const game=result.contractAddress,vault=await client.readContract({address:game,abi:gameAbi,functionName:'vault'});const d:Deployment={game,vault,block:String(result.blockNumber),rulesVersion:artifact.rulesVersion as 2};save(d);await readBalances(d);setMessage('Your wallet table is deployed on Base. Fund the house reserve, then deposit player USDC.');});}
 async function fund(){await run('Fund house reserve',async()=>{
  if(!deployment)return;const {client}=await clients();const house=await client.readContract({address:deployment.vault,abi:vaultAbi,functionName:'house'});
  const amount=house<75000000n?75000000n-house:0n;
  if(amount){await send({address:BASE_USDC,abi:erc20Abi,functionName:'approve',args:[deployment.vault,amount]});await send({address:deployment.vault,abi:treasuryAbi,functionName:'fundHouse',args:[amount]});}
  const paused=await client.readContract({address:deployment.vault,abi:treasuryAbi,functionName:'paused'});if(paused)await send({address:deployment.vault,abi:treasuryAbi,functionName:'setPaused',args:[false]});
  await readBalances();setMessage('House reserve funded. Deposit USDC to your player balance next.');
 });}
 async function deposit(){await run('Deposit player USDC',async()=>{
  if(!deployment)throw Error('Create your wallet table first.');const value=parseUSDC(depositAmount);if(value<=0n)throw Error('Enter a positive USDC amount.');
  const {client,account}=await clients();if(await client.readContract({address:deployment.vault,abi:vaultAbi,functionName:'paused'}))throw Error('Fund the house reserve before depositing.');
  const available=await client.readContract({address:BASE_USDC,abi:erc20Abi,functionName:'balanceOf',args:[account]});if(available<value)throw Error('Your Base wallet does not have enough native USDC for this deposit.');
  await send({address:BASE_USDC,abi:erc20Abi,functionName:'approve',args:[deployment.vault,value]});await send({address:deployment.vault,abi:vaultAbi,functionName:'depositFor',args:[account,value]});
  await readBalances();setMessage('Deposit confirmed on Base. Your player balance is ready.');
 });}
 async function withdrawPlayer(){await run('Withdraw player USDC',async()=>{
  if(!deployment)return;const {client,account}=await clients();const amount=await client.readContract({address:deployment.vault,abi:vaultAbi,functionName:'available',args:[account]});if(!amount)throw Error('No unlocked player funds to withdraw.');
  await send({address:deployment.vault,abi:vaultAbi,functionName:'withdraw',args:[amount,account]});await readBalances();setMessage('Unlocked player USDC returned to your wallet.');
 });}
 async function replay(d:Deployment,s:Secret){const {shuffle,initial,step,publicState}=replayEngine(d.rulesVersion??1);const {client}=await clients();const current=await client.readContract({address:d.game,abi:gameAbi,functionName:'state',args:[s.id]});const [p,, ,entropy,players,stakes]=current;setPhase(p);if(players.length===0||entropy===`0x${'0'.repeat(64)}`)return{current,model:undefined,actions:[],stakes};const events=await client.getContractEvents({address:d.game,abi:gameAbi,eventName:'Acted',args:{id:s.id},fromBlock:BigInt(d.block),toBlock:'latest'});const deck=shuffle(s.seed,entropy),model=initial(deck,players.length),actions=events.map(e=>({seat:e.args.seat!,move:e.args.move!}));for(const a of actions)step(model,deck,a);setState(publicState(model));return{current,model,actions,stakes};}
 async function progress(d:Deployment,s:Secret){
  const {observation,payouts}=replayEngine(d.rulesVersion??1);
  const {client}=await clients();let r=await replay(d,s);
  if(r.current[0]===2&&r.model){await send({address:d.game,abi:gameAbi,functionName:'observe',args:[s.id,observation(r.model)]});r=await replay(d,s);}
  if(r.current[0]===4){const settlementHash=await send({address:d.game,abi:gameAbi,functionName:'settle',args:[s.id,s.seed]});r=await replay(d,s);const observed=await client.getContractEvents({address:d.game,abi:gameAbi,eventName:'Observed',args:{id:s.id},fromBlock:BigInt(d.block),toBlock:'latest'});const proof:LabReceipt={...s,entropy:r.current[3],stakes:r.stakes.map(String),actions:r.actions,observations:observed.map(o=>o.args.data!),payouts:payouts(r.model!,r.stakes).map(String),settlementHash};verifyCryptoReceipt(proof);
   const exposure=keccak256(encodeAbiParameters([{type:'address'},{type:'bytes32'},{type:'uint256'}],[d.game,s.id,0n]));
   const wagers=await client.getContractEvents({address:d.vault,abi:vaultAbi,eventName:'WagerLocked',args:{id:exposure},fromBlock:BigInt(d.block),toBlock:'latest'});
   if(wagers.length!==1||wagers[0].args.fee!==wagerFee(r.stakes[0]))throw Error('Settlement confirmed but the house fee needs reconciliation.');
   setRecordedFee(String(wagers[0].args.fee));setReceipt(proof);setMessage('Round settled on Base. Payout and house fee verified.');}
  await readBalances(d);
 }
 async function deal(){await run('Commit, wager and deal — approve each transaction',async()=>{if(!deployment)return;let s=secret;const {client}=await clients();if(s){const old=await client.readContract({address:deployment.game,abi:gameAbi,functionName:'state',args:[s.id]});if(old[0]!==5&&old[0]!==0)throw Error('Resume or recover the current round first.');}
 s={id:random(),seed:random(),commitment:'0x'};s.commitment=keccak256(encodeAbiParameters([{type:'bytes32'}],[s.seed]));save(deployment,s);setReceipt(undefined);setRecordedFee(undefined);setState(undefined);
 await send({address:deployment.game,abi:gameAbi,functionName:'offer',args:[s.id,s.commitment]});await send({address:deployment.game,abi:gameAbi,functionName:'join',args:[s.id,5000000n,random()]});await send({address:deployment.game,abi:gameAbi,functionName:'start',args:[s.id]});await progress(deployment,s);
 });}
 async function act(move:number){await run('Play and verify',async()=>{if(!deployment||!secret)return;const r=await replay(deployment,secret);if(!r.model||!engine.legalMoves(r.model).includes(move))throw Error('Action not available');await send({address:deployment.game,abi:gameAbi,functionName:'act',args:[secret.id,move,extraStake(move,5000000n),keccak256(engine.observation(r.model))]});await progress(deployment,secret);});}
 async function resume(){await run('Resume or recover round',async()=>{if(!deployment||!secret)return;const {client}=await clients();const r=await replay(deployment,secret);const now=(await client.getBlock()).timestamp,p=r.current[0];if(p===5){await readBalances();setMessage('Round is already closed. Unlocked funds can be withdrawn.');return;}
 if(now>=r.current[1]){await send({address:deployment.game,abi:gameAbi,functionName:p===3?'autoStand':'claimFailure',args:[secret.id]});}
 else if(p===1){if(!r.current[4].length)throw Error('No wager locked. Wait for offer expiry, then recover before starting another round.');await send({address:deployment.game,abi:gameAbi,functionName:'start',args:[secret.id]});}
 await progress(deployment,secret);});}
 async function recoverFunds(){await run('Withdraw player funds and unreserved house funds',async()=>{if(!deployment)return;const {client,account}=await clients();const available=await client.readContract({address:deployment.vault,abi:vaultAbi,functionName:'available',args:[account]});if(available)await send({address:deployment.vault,abi:vaultAbi,functionName:'withdraw',args:[available,account]});const house=await client.readContract({address:deployment.vault,abi:treasuryAbi,functionName:'house'}),reserved=await client.readContract({address:deployment.vault,abi:treasuryAbi,functionName:'reserved'});if(house>reserved)await send({address:deployment.vault,abi:treasuryAbi,functionName:'withdrawProfit',args:[house-reserved]});await readBalances();setMessage(reserved?'Unlocked funds withdrawn; finish or recover the round for reserved funds.':'All player and house funds returned to your wallet.');});}
 function download(){if(!receipt)return;const url=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`mainnet-${receipt.id}.json`;a.click();URL.revokeObjectURL(url);}
 const activeRound=phase>0&&phase<5;
 const ready=!!owner&&!!deployment&&balance.available!==''&&balance.accounted===balance.assets&&!busy;
 const canDeal=ready&&!activeRound&&BigInt(balance.available)>=5010000n&&BigInt(balance.house)>=75000000n;
 const myHand=state?.seats[0];
 return <main className="live-table" data-room={roomId}>
  <Image className="live-backdrop" src={room.image} alt={room.description} fill sizes="100vw" priority/>
  <header className="live-table-header"><Link className="live-button quiet" href="/">Rooms</Link><span>{room.name} · USDC on Base</span><div><button className="live-button quiet" onClick={()=>setLedger(true)}>House ledger</button><button className="live-button" onClick={()=>owner?setCashier(true):void connect()} disabled={!!busy}>{owner?'Cashier':'Connect wallet'}</button></div></header>
  <section className="live-dealer" aria-label="Dealer hand"><small>DEALER</small><div className="live-cards">{state?state.dealer.map((value,i)=><LiveCard value={value} key={i}/>):<><LiveCard value={-1}/><LiveCard value={-1}/></>}{state&&!state.done&&<LiveCard value={-1}/>}</div></section>
  <section className="live-player" aria-label="Your on-chain hands">{myHand?.hands.map((hand,i)=><div key={i} className={`live-hand${!state?.done&&myHand.active===i?' active':''}`}><div className="live-cards">{hand.cards.map((value,j)=><LiveCard value={value} key={j}/>)}</div><strong>{total(hand.cards)}{hand.surrendered?' · surrendered':hand.multiplier===2?' · doubled':''}</strong></div>)}</section>
  <div className="live-room-status" role="status">{busy?busy:state?.insurance?'Dealer shows an ace · insurance decision':phase===5?'Round complete':phase===3?'Your turn':owner?'Your wallet table':'Connect your wallet to enter'}</div>
  <section className="live-dock"><div className="live-dock-balance"><small>PLAYER BALANCE</small><strong data-testid="player-balance">{display(balance.available)} <span>USDC</span></strong><small>Locked: {display(balance.locked)} USDC</small></div>
   <div className="live-actions">{!owner?<button className="live-button" disabled={!!busy} onClick={()=>void connect()}>Connect wallet</button>:!deployment?<button className="live-button" onClick={()=>setCashier(true)}>Set up wallet table</button>:phase===3&&state?<>{actionOptions(state,5000000n).map(([move,label])=><button className="live-button" key={move} disabled={!ready||!engine.legalMoves(state).includes(move)||BigInt(balance.available)<extraStake(move,5000000n)} onClick={()=>void act(move)}>{label}</button>)}</>:<button className="live-button" disabled={!canDeal} onClick={()=>void deal()}>Deal 5 USDC</button>}
    {owner&&deployment&&<button className="live-button quiet" disabled={!secret||!!busy} onClick={()=>void resume()}>Resume / recover round</button>}
    {receipt&&<button className="live-button quiet" onClick={download}>Download receipt</button>}
   </div><p>0.25% fee on the initial wager, rounded down to cents: <b>0.01 USDC per 5 USDC hand.</b> No extra fee for splits, doubles, or insurance.</p>
   {owner&&deployment&&!activeRound&&balance.house!==''&&BigInt(balance.house)<75000000n&&<p className="live-notice">House reserve needs 75 USDC before the next hand. Top up in the cashier.</p>}
   <p className="live-message" aria-live="polite">{message}{tx&&<> <a href={`https://basescan.org/tx/${tx}`} target="_blank" rel="noreferrer">Transaction receipt</a></>}</p>
  </section>
  {cashier&&<WalletDialog title="USDC cashier" onClose={()=>setCashier(false)}><p>Native USDC on Base. Your connected wallet funds both the house reserve and player balance for this first test. Contracts are unaudited; you confirm every transaction.</p><p className="live-address">{owner??'No wallet connected'}</p>
   <dl className="wallet-stats"><div><dt>Wallet USDC</dt><dd>{display(balance.wallet)}</dd></div><div><dt>Player balance</dt><dd>{display(balance.available)}</dd></div><div><dt>House reserve</dt><dd>{display(balance.house)}</dd></div></dl>
   {!owner?<button className="live-button" disabled={!!busy} onClick={()=>void connect()}>Connect Base wallet</button>:<>
    {!deployment&&<button className="live-button" disabled={!!busy} onClick={()=>void deploy()}>Create wallet table</button>}
    <button className="live-button quiet" disabled={!deployment||!!busy||activeRound} onClick={()=>void fund()}>Fund house reserve up to 75 USDC</button>
    <label className="wallet-amount">Player deposit (USDC)<input inputMode="decimal" value={depositAmount} onChange={e=>setDepositAmount(e.target.value)}/></label>
    <button className="live-button" disabled={!deployment||!!busy} onClick={()=>void deposit()}>Approve &amp; deposit USDC</button>
    <p>Suggested player deposit: {display(String(playerFunding))} USDC covers insurance and four doubled split hands. Initial wager: 5 USDC.</p>
    <button className="live-button quiet" disabled={!deployment||!!busy||!balance.available||BigInt(balance.available)===0n} onClick={()=>void withdrawPlayer()}>Withdraw player balance</button>
    <button className="live-button quiet" disabled={!deployment||!!busy} onClick={()=>void recoverFunds()}>Withdraw all unlocked player and house funds</button>
   </>}
   {deployment&&<a className="live-contract-link" href={`https://basescan.org/address/${deployment.game}`} target="_blank" rel="noreferrer">View table contract on BaseScan</a>}
   <p className="live-message" role="status">{busy?busy:message}</p>
  </WalletDialog>}
  {ledger&&<WalletDialog title="House ledger" onClose={()=>setLedger(false)}><p>Read directly from your Base vault. House bankroll includes your initial funding; it is not a profit figure. Fees are included in the bankroll and shown separately below.</p>
   <dl className="wallet-stats"><div><dt>House bankroll</dt><dd data-testid="house-bankroll">{display(balance.house)} USDC</dd></div><div><dt>Total table fees earned</dt><dd data-testid="house-fees">{display(balance.fees)} USDC</dd></div><div><dt>Reserved for open hands</dt><dd>{display(balance.reserved)} USDC</dd></div><div><dt>Withdrawable house funds</dt><dd>{balance.house&&balance.reserved?display(String(BigInt(balance.house)-BigInt(balance.reserved))):'—'} USDC</dd></div><div><dt>Vault token balance</dt><dd>{display(balance.assets)} USDC</dd></div><div><dt>Accounted funds</dt><dd>{display(balance.accounted)} USDC</dd></div></dl>
   <p data-testid="ledger-integrity">{balance.accounted===''?'Connect your wallet and create a table to read the ledger.':balance.accounted===balance.assets?'Vault balance matches accounted funds.':'Vault balance does not match accounted funds; new play is disabled.'}</p>
   {balance.block&&<p>Base block {balance.block}</p>}
   {receipt&&<section className="live-round-proof"><h3>Last verified round</h3><p>On-chain table fee: <b>{recordedFee?display(recordedFee):'—'} USDC</b></p><p>Player payout: {display(receipt.payouts[0])} USDC</p><a href={`https://basescan.org/tx/${receipt.settlementHash}`} target="_blank" rel="noreferrer">View settlement receipt</a></section>}
   <button className="live-button quiet" disabled={!owner||!!busy} onClick={()=>void run('Refresh house ledger',async()=>{await readBalances();setMessage('House ledger refreshed from Base.');})}>Refresh ledger</button>
  </WalletDialog>}
 </main>;
}
