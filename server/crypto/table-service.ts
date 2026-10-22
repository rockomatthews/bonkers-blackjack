import {randomBytes} from 'node:crypto';
import {encodeAbiParameters,encodeDeployData,parseEventLogs,hashTypedData,keccak256,verifyTypedData,type Address,type Hex} from 'viem';
import {checked,settings,seal,open,houseStatus} from './house';
import {houseTransaction} from './house-store';
import {tableAbi,tableVaultAbi} from '../../shared/crypto/table-abi';
import {vaultAbi} from '../../shared/crypto/vault';
import {gameAbi} from '../../shared/crypto/game-abi';
import {coinAbi} from '../../shared/crypto/coin';
import {BASE_USDC} from '../../shared/crypto/assets';
import {initial,shuffle,step,observation,publicState,extraStake,payouts,legalMoves,type CryptoState} from '../../shared/crypto/replay';
import {parseUSDC,wagerFee} from '../../shared/crypto/money';
import {typedOffer,typedBet,typedAction,typedAck,typedView,typedClose,tableEntropy,onchainOffer,type TableOffer,type TableHand,type FastSnapshot} from '../../shared/crypto/table-session';
import type {HouseDeployment} from '../../shared/crypto/house';
import artifact from '../../shared/crypto/table-artifact.json';
const random=()=>`0x${randomBytes(32).toString('hex')}` as Hex;
export type SavedTable=FastSnapshot&{encryptedSeeds?:string[];settlementRaw?:Hex;lastChainRead?:number;chainBlock?:string;lastAnswered?:string;};
function own(t:SavedTable|undefined,owner:Address):asserts t is SavedTable{if(!t||t.owner.toLowerCase()!==owner.toLowerCase())throw Error('Invalid table owner');}
function snapshot(t:SavedTable):FastSnapshot{const{encryptedSeeds,settlementRaw,lastChainRead,lastAnswered,chainBlock,...safe}=t;void encryptedSeeds;void settlementRaw;void lastChainRead;void lastAnswered;void chainBlock;return structuredClone(safe);}
function active(d:HouseDeployment|undefined):asserts d is HouseDeployment {if(d?.casinoVersion!==2)throw Error('Session tables are not activated');}
function model(t:SavedTable,at:number){const seed=open(t.encryptedSeeds![at]),deck=shuffle(seed,tableEntropy(t.id,t.offer!.nonce,t.offer!.seats[at],t.entropy!)),state=initial(deck,1);for(const move of t.hands[at].moves)step(state,deck,{seat:0,move});return{seed,deck,state};}
async function view(t:SavedTable,at:number,state:CryptoState,game:Address){const h=t.hands[at];h.state=publicState(state);h.observation=observation(state);h.viewSignature=await settings().account.signTypedData(typedView(game,hashTypedData(typedBet(game,t.offer!,t.entropy!)),h));if(state.done){h.proof={seed:open(t.encryptedSeeds![at]),moves:h.moves,observations:h.observations,signatures:h.signatures,acknowledgements:h.acknowledgements};}}
function cost(t:SavedTable){return t.hands.reduce((sum,h)=>sum+BigInt(h.stake)+h.moves.reduce((added,m)=>added+extraStake(m,BigInt(h.stake)),0n)+wagerFee(BigInt(h.stake)),0n);}
export async function registerTable(owner:Address,hash?:Hex){
 const c=await checked(),d=await houseTransaction(s=>s.deployment);active(d);
 const receipt=hash?await c.client.getTransactionReceipt({hash}):undefined;
 if(receipt&&(receipt.status!=='success'||!parseEventLogs({abi:tableAbi,eventName:'TableOpened',logs:receipt.logs}).some(log=>log.address.toLowerCase()===d.game.toLowerCase()&&log.args.owner?.toLowerCase()===owner.toLowerCase())))throw Error('Invalid table opening receipt');
 const blockNumber=receipt?.blockNumber??await c.client.getBlockNumber({cacheTime:0});
 const id=await c.client.readContract({address:d.game,abi:tableAbi,functionName:'ownerTable',args:[owner],blockNumber});
 if(id===`0x${'0'.repeat(64)}`)return null;
 const[t,v]=await Promise.all([c.client.readContract({address:d.game,abi:tableAbi,functionName:'tableState',args:[id],blockNumber}),c.client.readContract({address:d.vault,abi:tableVaultAbi,functionName:'tables',args:[id],blockNumber})]);
 if(t[0].toLowerCase()!==owner.toLowerCase()||v[0].toLowerCase()!==owner.toLowerCase())throw Error('Table ownership is still syncing. Retrying automatically.');
 return houseTransaction(s=>{s.fastTables??={};let saved=s.fastTables[id];if(saved?.chainBlock&&BigInt(saved.chainBlock)>blockNumber)return snapshot(saved);if(!saved)saved=s.fastTables[id]={id,owner,key:t[1],balance:String(v[1]),collateral:String(v[2]),limit:String(v[3]),expires:Number(t[3]),nonce:String(t[4]),closed:t[9],lastActivity:Date.now(),hands:[],settled:true};
  saved.chainBlock=String(blockNumber);saved.closeAt=Number(t[5]);saved.disputeAt=Number(t[6]);saved.closed=t[9];saved.lastChainRead=Date.now();
  // Only replace chain accounting after our completed batch actually advanced its nonce.
  if(!saved.offer||t[4]>BigInt(saved.offer.nonce)||saved.closed){saved.balance=String(v[1]);saved.collateral=String(v[2]);saved.nonce=String(t[4]);saved.settled=true;saved.settlementRaw=undefined;saved.error=undefined;}
  return snapshot(saved);});
}
export async function readTableSession(owner:Address){return houseTransaction(s=>{const t=Object.values(s.fastTables??{}).filter(t=>t.owner.toLowerCase()===owner.toLowerCase()).sort((a,b)=>b.expires-a.expires)[0];return t?snapshot(t):null;});}
export async function offerTableSession(owner:Address,bets:{seat:number;amount:string}[]){
 if(!Array.isArray(bets)||!bets.length||bets.length>7||new Set(bets.map(b=>b.seat)).size!==bets.length)throw Error('Invalid seat wagers');
 const wagers=bets.map(b=>{const stake=parseUSDC(b.amount);if(!Number.isInteger(b.seat)||b.seat<0||b.seat>6||stake<1000000n||stake>5000000n||stake%1000000n)throw Error('Invalid seat wager');return{seat:b.seat,stake};}).sort((a,b)=>a.seat-b.seat);
 const registered=await houseTransaction(s=>Object.values(s.fastTables??{}).some(t=>t.owner.toLowerCase()===owner.toLowerCase()&&!t.closed));if(!registered)await registerTable(owner);
 const c=settings();return houseTransaction(async s=>{const d=s.deployment;active(d);const t=Object.values(s.fastTables??{}).find(t=>t.owner.toLowerCase()===owner.toLowerCase()&&!t.closed);own(t,owner);
  if(t.closeAt||t.disputeAt||Date.now()>t.expires*1000||Date.now()-t.lastActivity>15*60*1000)throw Error('Table session expired. Leave the table and return to play.');
  if(t.offer&&(!t.settled||!t.entropy))return snapshot(t); // Never create a second shuffle for the same nonce.
  const required=wagers.reduce((sum,b)=>sum+b.stake+wagerFee(b.stake),0n),initial=wagers.reduce((sum,b)=>sum+b.stake,0n);
  if(required>BigInt(t.balance)||initial>BigInt(t.limit)||initial*15n>BigInt(t.collateral))throw Error('Table balance or house collateral does not cover these seats.');
  const seeds=wagers.map(()=>random());const o:TableOffer={tableId:t.id,nonce:t.nonce,validUntil:String(Math.min(t.expires,Math.floor(Date.now()/1000)+120)),seats:wagers.map(b=>b.seat),stakes:wagers.map(b=>String(b.stake)),commitments:seeds.map(seed=>keccak256(encodeAbiParameters([{type:'bytes32'}],[seed]))),signature:'0x'};
  o.signature=await c.account.signTypedData(typedOffer(d.game,o));t.offer=o;t.encryptedSeeds=seeds.map(seal);t.hands=[];t.entropy=undefined;t.betSignature=undefined;t.settlementHash=undefined;t.settlementRaw=undefined;t.lastActivity=Date.now();t.error=undefined;t.settled=false;return snapshot(t);
 });
}
export async function betTableSession(owner:Address,id:Hex,entropy:Hex,signature:Hex,recovery=false){
 const c=settings();return houseTransaction(async s=>{const t=s.fastTables?.[id],d=s.deployment;own(t,owner);active(d);if(!t.offer||t.closed||((t.closeAt||t.disputeAt)&&!recovery))throw Error('Invalid table wager');
  if(t.entropy){if(t.entropy!==entropy||t.betSignature!==signature)throw Error('Invalid changed wager');return snapshot(t);}
  if(!recovery&&Number(t.offer.validUntil)*1000<Date.now())throw Error('Table offer expired. Close and return to the table.');
  if(!await verifyTypedData({address:t.key,...typedBet(d.game,t.offer,entropy),signature}))throw Error('Invalid player wager signature');
  t.entropy=entropy;t.betSignature=signature;t.lastActivity=Date.now();
  t.hands=t.offer.seats.map((seat,i)=>({seat,stake:t.offer!.stakes[i],state:{} as CryptoState,observation:'0x',viewSignature:'0x',moves:[],observations:[],signatures:[],acknowledgements:[]}));
  for(let i=0;i<t.hands.length;i++){const {state}=model(t,i);t.hands[i].observations=[keccak256(observation(state))];await view(t,i,state,d.game);}
  return snapshot(t);
 });
}
export async function actTableSession(owner:Address,id:Hex,seat:number,index:number,move:number,signature:Hex){
 const c=settings();return houseTransaction(async s=>{const t=s.fastTables?.[id],d=s.deployment;own(t,owner);active(d);if(!t.offer||!t.entropy||t.closed||t.closeAt||t.disputeAt)throw Error('Invalid active table');const at=t.hands.findIndex(h=>h.seat===seat),h=t.hands[at];if(!h)throw Error('Invalid hand');
  if(index<h.moves.length){if(h.signatures[index]!==signature||h.moves[index]!==move)throw Error('Invalid conflicting action');return snapshot(t);}
  if(!Number.isInteger(index)||index!==h.moves.length||index>=128)throw Error('Invalid action index');
  if(Date.now()-t.lastActivity>15*60*1000&&move!==2&&move!==6)throw Error('Table session expired. Stand or decline insurance to finish.');
  const action=typedAction(d.game,hashTypedData(typedBet(d.game,t.offer,t.entropy)),seat,index,move,h.observation);
  if(!await verifyTypedData({address:t.key,...action,signature}))throw Error('Invalid player action signature');
  const {state,deck}=model(t,at);if(!legalMoves(state).includes(move))throw Error('Invalid blackjack action');if(cost(t)+extraStake(move,BigInt(h.stake))>BigInt(t.balance))throw Error('Table balance does not cover this action');
  const ack=await c.account.signTypedData(typedAck(d.game,hashTypedData(action)));step(state,deck,{seat:0,move});h.moves.push(move);h.signatures.push(signature);h.acknowledgements.push(ack);h.observations.push(keccak256(observation(state)));t.lastActivity=Date.now();await view(t,at,state,d.game);return snapshot(t);
 });
}
/** One transaction for the entire finished layout. Retain signed bytes across cold starts. */
export async function settleTableSession(owner:Address){
 const c=await checked();const prepared=await houseTransaction(async s=>{const d=s.deployment;active(d);const t=Object.values(s.fastTables??{}).find(t=>t.owner.toLowerCase()===owner.toLowerCase()&&!t.closed);if(!t||t.settled||!t.entropy||!t.offer||!t.betSignature||!t.hands.length||t.hands.some(h=>!h.state.done))return null;
  if(!t.settlementRaw){const request=await c.wallet.prepareTransactionRequest({account:c.account,to:d.game,data:(await import('viem')).encodeFunctionData({abi:tableAbi,functionName:'settleTableRound',args:[onchainOffer(t.offer),t.entropy,t.betSignature,t.hands.map(h=>h.proof!)]})});t.settlementRaw=await c.wallet.signTransaction(request);t.settlementHash=keccak256(t.settlementRaw);}
  try{await c.client.sendRawTransaction({serializedTransaction:t.settlementRaw});}catch{/* Receipt lookup below resolves uncertain/duplicate broadcasts. */}return{hash:t.settlementHash!,id:t.id};
 });
 if(!prepared)return;try{const receipt=await c.client.waitForTransactionReceipt({hash:prepared.hash,timeout:25000});if(receipt.status!=='success')throw Error('Table settlement reverted');await registerTable(owner);}catch{await houseTransaction(s=>{if(s.fastTables?.[prepared.id])s.fastTables[prepared.id].error='Settlement is pending. It will retry automatically.';});}
}
export async function closeTableSession(owner:Address,id:Hex,signature:Hex){
 const c=await checked();const hash=await houseTransaction(async s=>{const t=s.fastTables?.[id],d=s.deployment;own(t,owner);active(d);if(t.closed)return null;if(t.entropy&&!t.settled)throw Error('Finish the hand and its settlement before leaving.');if(!await verifyTypedData({address:t.key,...typedClose(d.game,id,t.nonce),signature})&&!await verifyTypedData({address:owner,...typedClose(d.game,id,t.nonce),signature}))throw Error('Invalid table close signature');
  const dealerSignature=await c.account.signTypedData(typedClose(d.game,id,t.nonce));return c.wallet.writeContract({address:d.game,abi:tableAbi,functionName:'closeTableCooperative',args:[id,BigInt(t.nonce),signature,dealerSignature]});});
 if(hash){if((await c.client.waitForTransactionReceipt({hash,timeout:25000})).status!=='success')throw Error('Table close reverted');}return registerTable(owner);
}
export async function migrationStatus(owner:Address){const c=await checked();return houseTransaction(async s=>({pending:s.pendingDeployment,monitorReady:!!process.env.CRON_SECRET||process.env.BONKERS_LOCAL_STORE==='1',retired:await Promise.all((s.retiredDeployments??[]).map(async d=>({...d,available:String(await c.client.readContract({address:d.vault,abi:vaultAbi,functionName:'available',args:[owner]}))})))}));}
export async function registerSessionDeployment(owner:Address,hash:Hex){
 const c=await checked();if(owner.toLowerCase()!==c.house.toLowerCase())throw Error('Only the house wallet can prepare session tables');const[tx,r]=await Promise.all([c.client.getTransaction({hash}),c.client.getTransactionReceipt({hash})]);const expected=encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode as Hex,args:[BASE_USDC,c.house,c.account.address]});
 if(r.status!=='success'||!r.contractAddress||tx.to!==null||tx.from.toLowerCase()!==owner.toLowerCase()||tx.input.toLowerCase()!==expected.toLowerCase())throw Error('Invalid session deployment');
 const vault=await c.client.readContract({address:r.contractAddress,abi:gameAbi,functionName:'vault'});await houseTransaction(s=>{if(s.pendingDeployment&&s.pendingDeployment.game.toLowerCase()!==r.contractAddress!.toLowerCase())throw Error('A session deployment is already prepared');s.pendingDeployment={game:r.contractAddress!,vault,block:String(r.blockNumber),transaction:hash,casinoVersion:2};});return migrationStatus(owner);
}
export async function activateSessionDeployment(owner:Address){
 const c=await checked();if(owner.toLowerCase()!==c.house.toLowerCase())throw Error('Only the house wallet can activate session tables');if(!process.env.CRON_SECRET&&process.env.BONKERS_LOCAL_STORE!=='1')throw Error('Recovery monitor must be configured before activation');
 await houseTransaction(async s=>{const old=s.deployment,next=s.pendingDeployment;if(!next)throw Error('No session deployment is prepared');
  if(old){if(!await c.client.readContract({address:old.vault,abi:vaultAbi,functionName:'paused'}))throw Error('Close existing deposits before activation');for(const r of Object.values(s.rounds)){if(!r.closed&&(await c.client.readContract({address:old.game,abi:gameAbi,functionName:'state',args:[r.id]}))[0]!==5)throw Error('Finish existing blackjack hands before activation');}for(const r of Object.values(s.coins??{}))if((await c.client.readContract({address:old.game,abi:coinAbi,functionName:'coinState',args:[r.id]})).phase<3)throw Error('Finish existing tosses before activation');}
  const[house,paused,version]=await Promise.all([c.client.readContract({address:next.vault,abi:vaultAbi,functionName:'house'}),c.client.readContract({address:next.vault,abi:vaultAbi,functionName:'paused'}),c.client.readContract({address:next.game,abi:tableAbi,functionName:'tableVersion'})]);if(house<75000000n||!paused||version!==1)throw Error('Fund at least 75 USDC in the prepared vault and leave deposits closed');
  if(old){(s.retiredDeployments??=[]).push(old);(s.retiredGameData??={})[old.game.toLowerCase()]={rounds:s.rounds,coins:s.coins??{},coinHistory:s.coinHistory??{}};}s.deployment=next;s.pendingDeployment=undefined;s.rounds={};s.coins={};s.coinHistory={};
 });return houseStatus();
}
/** Called by the authenticated recovery monitor and player progress requests. */
export async function maintainTables(){
 const c=await checked(),sessions=await houseTransaction(s=>Object.values(s.fastTables??{}).filter(t=>!t.closed).map(snapshot));
 for(const saved of sessions){try{let current=await registerTable(saved.owner);if(!current||current.closed)continue;
  const deployment=await houseTransaction(s=>s.deployment!);
  async function send(method:'requestTableClose'|'claimTableClose'|'finalizeTableDispute'|'disputeTableRound',args:unknown[]){const hash=await houseTransaction(()=>c.wallet.writeContract({address:deployment.game,abi:tableAbi,functionName:method,args} as never));if((await c.client.waitForTransactionReceipt({hash,timeout:25000})).status!=='success')throw Error('Recovery transaction reverted');}
  if(!current.closeAt&&Date.now()>=current.expires*1000){await send('requestTableClose',[current.id]);current=(await registerTable(saved.owner))!;}
  if(current.closeAt&&Date.now()>=current.closeAt*1000){await send('claimTableClose',[current.id]);await registerTable(saved.owner);continue;}
  if(current.disputeAt&&Date.now()>=current.disputeAt*1000){await send('finalizeTableDispute',[current.id]);current=(await registerTable(saved.owner))!;}
  if(current.entropy&&current.offer&&current.betSignature&&!current.settled&&current.hands.some(h=>!h.state.done)&&!current.disputeAt&&(current.closeAt||Date.now()-current.lastActivity>=15*60*1000)){await send('disputeTableRound',[onchainOffer(current.offer),current.entropy,current.betSignature]);current=(await registerTable(saved.owner))!;}

  if(current.disputeAt&&!current.entropy&&current.offer&&Date.now()<current.disputeAt*1000){const d=await houseTransaction(s=>s.deployment!);const block=await c.client.getBlockNumber({cacheTime:0});const events=await c.client.getContractEvents({address:d.game,abi:tableAbi,eventName:'TableDisputed',args:{id:current.id},fromBlock:block>45000n?block-45000n:0n,toBlock:block});const event=events.at(-1);if(event?.args.entropy&&event.args.betSignature)current=await betTableSession(saved.owner,current.id,event.args.entropy,event.args.betSignature,true);}

  if(current.disputeAt&&Date.now()<current.disputeAt*1000&&current.offer&&current.entropy&&current.betSignature){const data=await houseTransaction(s=>{const t=s.fastTables![current.id];return{t:structuredClone(t),d:s.deployment!};});
   const proofs=data.t.hands.map((h,i)=>({seed:open(data.t.encryptedSeeds![i]),moves:h.moves,observations:h.observations,signatures:h.signatures,acknowledgements:h.acknowledgements}));
   const tag=String(current.disputeAt)+':'+proofs.map(p=>p.moves.length).join(',');if(proofs.length===current.offer.seats.length&&data.t.lastAnswered!==tag){const hash=await houseTransaction(()=>c.wallet.writeContract({address:data.d.game,abi:tableAbi,functionName:'answerTableDispute',args:[onchainOffer(current.offer!),current.entropy!,current.betSignature!,proofs]}));if((await c.client.waitForTransactionReceipt({hash,timeout:25000})).status!=='success')throw Error('Recovery answer reverted');await houseTransaction(s=>{if(s.fastTables?.[current!.id])s.fastTables[current!.id].lastAnswered=tag;});}
  }else await settleTableSession(saved.owner);
 }catch{console.error('table-maintenance-failed',{table:saved.id});}}
}
