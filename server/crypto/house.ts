import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {createPublicClient,createWalletClient,http,erc20Abi,parseAbi,encodeAbiParameters,encodeDeployData,keccak256,isAddress,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {base} from 'viem/chains';
import {SignJWT,jwtVerify} from 'jose';
import {HOUSE_ADDRESS,HOUSE_RESERVE,INITIAL_WAGER,walletLoginMessage,type HouseStatus,type HouseRound,type HouseDeployment} from '../../shared/crypto/house';
import {BASE_USDC} from '../../shared/crypto/assets';
import {gameAbi} from '../../shared/crypto/game-abi';
import {vaultAbi} from '../../shared/crypto/vault';
import {coinAbi,verifyCoinReceipt,type CoinRound,type TossCount} from '../../shared/crypto/coin';
import {parseUSDC,wagerFee} from '../../shared/crypto/money';
import {replayEngine} from '../../shared/crypto/engines';
import {houseTransaction,houseStoreAvailable,type SavedRound,type SavedCoin,type HouseData} from './house-store';
import artifact from '../../shared/crypto/pilot-artifact.json';
const treasuryAbi=parseAbi(['function treasury() view returns(address)']);
const random=()=>`0x${randomBytes(32).toString('hex')}` as Hex;
export function settings(){
 const key=process.env.BONKERS_DEALER_KEY;if(!key||!/^0x[0-9a-fA-F]{64}$/.test(key))throw Error('Dealer is being prepared. Deposits remain closed.');
 const rpc=process.env.BONKERS_RPC_URL??'https://mainnet.base.org';const url=new URL(rpc);if(url.protocol!=='https:'&&!(process.env.BONKERS_LOCAL_STORE==='1'&&!process.env.VERCEL&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Invalid Base RPC');
 const house=(process.env.BONKERS_HOUSE_ADDRESS??HOUSE_ADDRESS) as Address;if(!isAddress(house))throw Error('House address is invalid');
 const account=privateKeyToAccount(key as Hex),client=createPublicClient({chain:base,transport:http(rpc,{timeout:12000,retryCount:1}),pollingInterval:500}),wallet=createWalletClient({chain:base,account,transport:http(rpc,{timeout:12000,retryCount:0})});
 return{key,house,account,client,wallet};
}
function secretKey(){return createHash('sha256').update('bonkers-dealer-seeds-v1\0'+settings().key).digest();}
export function seal(seed:Hex){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secretKey(),nonce);const body=Buffer.concat([cipher.update(seed,'utf8'),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),body]).toString('base64');}
export function open(value:string){const b=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',secretKey(),b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString('utf8') as Hex;}
export async function checked(){const c=settings();if(await c.client.getChainId()!==8453)throw Error('Wrong settlement chain');return c;}
export async function houseStatus():Promise<HouseStatus>{
 const house=(process.env.BONKERS_HOUSE_ADDRESS??HOUSE_ADDRESS) as Address;
 let knownDeployment:HouseDeployment|undefined,dealer:Address|undefined;
 try{
  if(!houseStoreAvailable())throw Error('House setup is in progress. Deposits are closed.');const c=settings();dealer=c.account.address;const deployment=await houseTransaction(s=>s.deployment);knownDeployment=deployment;
  const common={house,dealer:c.account.address,deployment,depositsOpen:false,dealerReady:false};
  if(!deployment)return{...common,reason:'Waiting for the house wallet to create the shared table.'};
  if(await c.client.getChainId()!==8453)throw Error('Wrong settlement chain');
  const blockNumber=await c.client.getBlockNumber();const read={address:deployment.vault,blockNumber} as const;
  const [treasury,token,operator,vault,version,paused,houseBalance,reserved,assets,accounted,dealerGas]=await Promise.all([
   c.client.readContract({...read,abi:treasuryAbi,functionName:'treasury'}),c.client.readContract({...read,abi:vaultAbi,functionName:'token'}),
   c.client.readContract({address:deployment.game,abi:gameAbi,functionName:'operator',blockNumber}),c.client.readContract({address:deployment.game,abi:gameAbi,functionName:'vault',blockNumber}),c.client.readContract({address:deployment.game,abi:gameAbi,functionName:'rulesVersion',blockNumber}),
   c.client.readContract({...read,abi:vaultAbi,functionName:'paused'}),c.client.readContract({...read,abi:vaultAbi,functionName:'house'}),c.client.readContract({...read,abi:vaultAbi,functionName:'reserved'}),
   c.client.readContract({address:BASE_USDC,abi:erc20Abi,functionName:'balanceOf',args:[deployment.vault],blockNumber}),c.client.readContract({...read,abi:vaultAbi,functionName:'accountedAssets'}),c.client.getBalance({address:c.account.address,blockNumber})]);
  if(treasury.toLowerCase()!==house.toLowerCase()||token.toLowerCase()!==BASE_USDC.toLowerCase()||operator.toLowerCase()!==c.account.address.toLowerCase()||vault.toLowerCase()!==deployment.vault.toLowerCase()||version!==2)throw Error('Shared table configuration mismatch. Deposits are closed.');
  const dealerReady=dealerGas>=100000000000000n,collateral=houseBalance>=reserved+HOUSE_RESERVE,solvent=assets>=accounted&&houseBalance>=reserved;
  return{...common,dealerReady,houseBalance:String(houseBalance),reserved:String(reserved),dealerGas:String(dealerGas),wagersOpen:!paused&&dealerReady&&solvent,freeCollateral:String(houseBalance-reserved),activeLimit:activeLimit(),depositsOpen:!paused&&dealerReady&&collateral&&solvent,reason:!solvent?'Vault reconciliation required.':!dealerReady?'Waiting for the house to fund dealer transaction fees.':!collateral?'Waiting for the house reserve to be funded.':paused?'Deposits are closed until the house wallet explicitly opens them.':'Deposits are open.'};
 }catch(e){return{house,dealer,deployment:knownDeployment,depositsOpen:false,dealerReady:false,reason:e instanceof Error&&/^(Dealer is being prepared|House setup|Shared table configuration mismatch)/.test(e.message)?e.message:'House unavailable. Deposits remain closed.'};}
}
export async function challenge(owner:Address,origin:string){if(!isAddress(owner))throw Error('Invalid wallet');const nonce=random();await houseTransaction(s=>{for(const [n,v]of Object.entries(s.challenges))if(v.expires<Date.now())delete s.challenges[n];if(Object.keys(s.challenges).length>=500)throw Error('Please retry shortly');s.challenges[nonce]={owner,expires:Date.now()+120000};});return{nonce,message:walletLoginMessage(origin,owner,nonce)};}
export async function login(owner:Address,nonce:string,signature:Hex,origin:string){const c=await checked();const entry=await houseTransaction(s=>s.challenges[nonce]);if(!entry||entry.expires<Date.now()||entry.owner.toLowerCase()!==owner.toLowerCase())throw Error('Wallet sign-in expired');if(!await c.client.verifyMessage({address:owner,message:walletLoginMessage(origin,owner,nonce),signature}))throw Error('Wallet signature rejected');await houseTransaction(s=>{if(!s.challenges[nonce])throw Error('Wallet sign-in already used');delete s.challenges[nonce];});return new SignJWT({owner:owner.toLowerCase(),origin}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').setAudience('bonkers-house').sign(secretKey());}
export async function session(token:string,origin:string){const{payload}=await jwtVerify(token,secretKey(),{audience:'bonkers-house',algorithms:['HS256']});if(payload.origin!==origin||typeof payload.owner!=='string'||!isAddress(payload.owner))throw Error('Reconnect your wallet');return payload.owner as Address;}
export async function register(owner:Address,hash:Hex){
 const c=await checked();if(owner.toLowerCase()!==c.house.toLowerCase())throw Error('Only the house wallet can create the shared table');
 const [tx,receipt]=await Promise.all([c.client.getTransaction({hash}),c.client.getTransactionReceipt({hash})]);
 const expected=encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode as Hex,args:[BASE_USDC,c.house,c.account.address]});
 if(receipt.status!=='success'||!receipt.contractAddress||tx.to!==null||tx.from.toLowerCase()!==owner.toLowerCase()||tx.input.toLowerCase()!==expected.toLowerCase())throw Error('Table deployment does not match the approved artifact');
 const game=receipt.contractAddress,vault=await c.client.readContract({address:game,abi:gameAbi,functionName:'vault'});
 await houseTransaction(s=>{if(s.deployment&&s.deployment.game.toLowerCase()!==game.toLowerCase())throw Error('A shared house table already exists');s.deployment={game,vault,block:String(receipt.blockNumber),transaction:hash,casinoVersion:1};});return houseStatus();
}
async function send(c:Awaited<ReturnType<typeof checked>>,game:Address,functionName:'offerFor'|'start'|'observe'|'autoStand'|'settle'|'claimFailure',args:readonly unknown[]){const hash=await c.wallet.writeContract({address:game,abi:gameAbi,functionName,args} as Parameters<typeof c.wallet.writeContract>[0]);const receipt=await c.client.waitForTransactionReceipt({hash,timeout:25000});if(receipt.status!=='success')throw Error('Dealer transaction reverted');return hash;}
// Product rule: each wallet gets its own round/dealer hand. Do not merge wallets into a seven-seat game.
export async function offer(owner:Address){
 const status=await houseStatus();if(!status.depositsOpen||!status.deployment)throw Error(status.reason);const c=await checked();
 if(await c.client.readContract({address:status.deployment.vault,abi:vaultAbi,functionName:'available',args:[owner]})<5010000n)throw Error('Deposit at least 5.01 USDC before playing.');
 // Persist the seed before any chain write so retries/cold starts cannot lose it.
 const round=await houseTransaction(async s=>{const previous=s.rounds[owner.toLowerCase()];if(previous){const st=await c.client.readContract({address:status.deployment!.game,abi:gameAbi,functionName:'state',args:[previous.id]});if(st[0]!==5)return previous;}
  await admit(c,s,75000000n,owner);
  const seed=random(),r={block:String(await c.client.getBlockNumber()),id:random(),owner,encryptedSeed:seal(seed),commitment:keccak256(encodeAbiParameters([{type:'bytes32'}],[seed])),created:Date.now()};s.rounds[owner.toLowerCase()]=r;return r;});
 await progress(owner,round.id);return readRound(owner);
}
async function roundModel(c:Awaited<ReturnType<typeof checked>>,d:NonNullable<HouseData['deployment']>,r:SavedRound){
 const st=await c.client.readContract({address:d.game,abi:gameAbi,functionName:'state',args:[r.id]});if(st[0]<2)return{st};
 if(st[0]===5){const finished=await c.client.getContractEvents({address:d.game,abi:gameAbi,eventName:'Finished',args:{id:r.id},fromBlock:BigInt(r.block),toBlock:'latest'});if(finished.at(-1)?.args.failure)return{st};}
 const events=await c.client.getContractEvents({address:d.game,abi:gameAbi,eventName:'Acted',args:{id:r.id},fromBlock:BigInt(r.block),toBlock:'latest'});if(BigInt(events.length)!==st[7])throw Error('Action history incomplete');
 const engine=replayEngine(2),seed=open(r.encryptedSeed),deck=engine.shuffle(seed,st[3]),model=engine.initial(deck,st[4].length),actions=events.map(e=>({seat:e.args.seat!,move:e.args.move!}));for(const a of actions)engine.step(model,deck,a);return{st,seed,model,actions,engine};
}
export async function progress(owner:Address,id:Hex){
 const c=await checked();return houseTransaction(async s=>{const d=s.deployment,r=s.rounds[owner.toLowerCase()];if(!d||!r||r.id!==id)throw Error('Round unavailable');
  for(let n=0;n<4;n++){
   const data=await roundModel(c,d,r),{st}=data;const now=(await c.client.getBlock()).timestamp;
   if(st[0]===0){await admit(c,s,75000000n,owner,r.id);const statusPaused=await c.client.readContract({address:d.vault,abi:vaultAbi,functionName:'paused'});if(statusPaused)throw Error('Deposits are closed');await send(c,d.game,'offerFor',[r.id,r.commitment,r.owner]);break;}
   if(st[0]===5){r.closed=true;break;}
   if(now>=st[1]){await send(c,d.game,st[0]===3?'autoStand':'claimFailure',[r.id]);continue;}
   if(st[0]===1){if(!st[4].length)break;if(st[4].length!==1||st[4][0].toLowerCase()!==owner.toLowerCase())throw Error('Unexpected player in round');await send(c,d.game,'start',[r.id]);continue;}
   if(st[0]===2){await send(c,d.game,'observe',[r.id,data.engine!.observation(data.model!)]);continue;}
   if(st[0]===4){await send(c,d.game,'settle',[r.id,data.seed!]);continue;}
   break;
  }
  if((await c.client.readContract({address:d.game,abi:gameAbi,functionName:'state',args:[r.id]}))[0]===5)r.closed=true;
 });
}
export async function readRound(owner:Address):Promise<HouseRound|null>{
 const c=await checked(),saved=await houseTransaction(s=>({d:s.deployment,r:s.rounds[owner.toLowerCase()]}));if(!saved.d||!saved.r)return null;const{d,r}=saved;
 const data=await roundModel(c,d,r),{st}=data;const result:HouseRound={id:r.id,commitment:r.commitment,phase:st[0],deadline:String(st[1]),players:[...st[4]],stakes:st[5].map(String)};
 if(data.model){result.state=data.engine!.publicState(data.model);result.observation=data.engine!.observation(data.model);}
 if(st[0]===5){const finished=await c.client.getContractEvents({address:d.game,abi:gameAbi,eventName:'Finished',args:{id:r.id},fromBlock:BigInt(r.block),toBlock:'latest'});const last=finished.at(-1);if(last?.args.failure){result.failure=true;delete result.state;delete result.observation;}else if(last&&data.model){const observed=await c.client.getContractEvents({address:d.game,abi:gameAbi,eventName:'Observed',args:{id:r.id},fromBlock:BigInt(r.block),toBlock:'latest'});result.receipt={id:r.id,seed:data.seed!,commitment:r.commitment,entropy:st[3],stakes:st[5].map(String),actions:data.actions!,observations:observed.map(x=>x.args.data!),payouts:data.engine!.payouts(data.model,st[5]).map(String),settlementHash:last.transactionHash!};}}
 return result;
}

function activeLimit(){const n=Number(process.env.BONKERS_MAX_ACTIVE_ROUNDS??'10');if(!Number.isInteger(n)||n<1||n>50)throw Error('Invalid dealer capacity');return n;}
/** Serialize admission across BOTH games. Pending offers reserve capacity before dealer gas is spent. */
async function admit(c:Awaited<ReturnType<typeof checked>>,s:HouseData,required:bigint,owner:Address,exclude?:Hex){
 if(!s.deployment)throw Error('House setup is incomplete');const d=s.deployment,blockNumber=await c.client.getBlockNumber(),now=(await c.client.getBlock({blockNumber})).timestamp;
 const [house,reserved,paused]=await Promise.all([c.client.readContract({address:d.vault,abi:vaultAbi,functionName:'house',blockNumber}),c.client.readContract({address:d.vault,abi:vaultAbi,functionName:'reserved',blockNumber}),c.client.readContract({address:d.vault,abi:vaultAbi,functionName:'paused',blockNumber})]);if(paused)throw Error('Deposits are closed');let pending=0n,active=0;
 for(const [kind,records]of [['blackjack',s.rounds],['coin',s.coins??{}]] as const){for(const r of Object.values(records)){if(r.closed||r.id===exclude)continue;
  let phase:number,deadline:bigint,joined:boolean;
  if(kind==='blackjack'){const st=await c.client.readContract({address:d.game,abi:gameAbi,functionName:'state',args:[r.id],blockNumber});phase=st[0];deadline=st[1];joined=st[4].length>0;if(phase===5){r.closed=true;continue;}}
  else{const st=await c.client.readContract({address:d.game,abi:coinAbi,functionName:'coinState',args:[r.id],blockNumber});phase=st.phase;deadline=st.deadline;joined=phase===2;if(phase===3){r.closed=true;continue;}}
  if(!joined&&((phase===0&&r.created+60000<Date.now())||(phase===1&&deadline<=now)))continue;
  if(r.owner.toLowerCase()===owner.toLowerCase())throw Error('Finish or recover your active round before starting another.');
  active++;if(!joined)pending+=kind==='blackjack'?75000000n:BigInt((r as SavedCoin).stake);
 }}
 if(active>=activeLimit())throw Error('Dealer capacity is full. Please try again after a round settles.');
 if(house<reserved+pending+required)throw Error('House capacity is full. No wager was accepted. Try again after settlement or house funding.');
}
async function sendCoin(c:Awaited<ReturnType<typeof checked>>,game:Address,functionName:'offerCoin'|'settleCoin'|'claimCoinFailure',args:readonly unknown[]){const hash=await c.wallet.writeContract({address:game,abi:coinAbi,functionName,args} as Parameters<typeof c.wallet.writeContract>[0]);if((await c.client.waitForTransactionReceipt({hash,timeout:25000})).status!=='success')throw Error('Coin transaction reverted');return hash;}
export async function offerCoin(owner:Address,amount:string,count:TossCount){
 const stake=parseUSDC(amount);if(![1,11,21].includes(count)||stake<1000000n||stake>5000000n||stake%10000n!==0n)throw Error('Invalid coin wager. Use 1–5 USDC in cents and 1, 11 or 21 tosses.');
 const status=await houseStatus();if(!status.deployment?.casinoVersion)throw Error('Toin Coss requires the Bonkers casino contract. Existing withdrawals remain available.');if(!status.wagersOpen)throw Error(status.reason);const c=await checked();
 if(await c.client.readContract({address:status.deployment.vault,abi:vaultAbi,functionName:'available',args:[owner]})<stake+wagerFee(stake))throw Error('Deposit enough USDC for the wager and displayed fee.');
 const r=await houseTransaction(async s=>{s.coins??={};const previous=s.coins[owner.toLowerCase()];if(previous){const st=await c.client.readContract({address:status.deployment!.game,abi:coinAbi,functionName:'coinState',args:[previous.id]});if(st.phase!==3)return previous;previous.closed=true;s.coinHistory??={};const history=s.coinHistory[owner.toLowerCase()]??=[];if(!history.some(v=>v.id===previous.id))history.unshift({...previous});s.coinHistory[owner.toLowerCase()]=history.slice(0,50);}
  await admit(c,s,stake,owner);const seed=random(),saved:SavedCoin={id:random(),owner,stake:String(stake),count,block:String(await c.client.getBlockNumber()),encryptedSeed:seal(seed),commitment:keccak256(encodeAbiParameters([{type:'bytes32'}],[seed])),created:Date.now()};s.coins[owner.toLowerCase()]=saved;return saved;});
 await progressCoin(owner,r.id);return readCoin(owner);
}
export async function progressCoin(owner:Address,id:Hex){const c=await checked();return houseTransaction(async s=>{const d=s.deployment,r=s.coins?.[owner.toLowerCase()];if(!d?.casinoVersion||!r||r.id!==id)throw Error('Round unavailable');let st=await c.client.readContract({address:d.game,abi:coinAbi,functionName:'coinState',args:[id]});const now=(await c.client.getBlock()).timestamp;
 if(st.phase===0){await admit(c,s,BigInt(r.stake),owner,id);await sendCoin(c,d.game,'offerCoin',[r.id,r.commitment,r.owner,BigInt(r.stake),r.count]);}
 else if((st.phase===1||st.phase===2)&&now>=st.deadline)await sendCoin(c,d.game,'claimCoinFailure',[id]);
 else if(st.phase===2)await sendCoin(c,d.game,'settleCoin',[id,open(r.encryptedSeed)]);
 st=await c.client.readContract({address:d.game,abi:coinAbi,functionName:'coinState',args:[id]});if(st.phase===3){r.closed=true;s.coinHistory??={};const records=s.coinHistory[owner.toLowerCase()]??=[];if(!records.some(v=>v.id===id))records.unshift({...r});s.coinHistory[owner.toLowerCase()]=records.slice(0,50);}
 });}
async function coinPublic(c:Awaited<ReturnType<typeof checked>>,d:NonNullable<HouseData['deployment']>,r:SavedCoin):Promise<CoinRound>{const st=await c.client.readContract({address:d.game,abi:coinAbi,functionName:'coinState',args:[r.id]});
 const result:CoinRound={id:r.id,player:r.owner,commitment:r.commitment,stake:r.stake,count:r.count,choice:st.choice as 0|1,phase:st.phase,deadline:String(st.deadline),heads:st.heads,payout:String(st.payout),failure:st.failure};
 if(st.phase>0&&(st.player.toLowerCase()!==r.owner.toLowerCase()||st.commitment!==r.commitment||st.stake!==BigInt(r.stake)||st.count!==r.count))throw Error('Coin round configuration mismatch');
 if(st.phase===3&&!st.failure){const events=await c.client.getContractEvents({address:d.game,abi:coinAbi,eventName:'CoinFinished',args:{id:r.id},fromBlock:BigInt(r.block),toBlock:'latest'});const finished=events.at(-1);if(!finished?.args.seed)throw Error('Coin settlement evidence unavailable');result.receipt={id:r.id,commitment:r.commitment,seed:finished.args.seed,entropy:st.entropy,count:r.count,choice:st.choice as 0|1,stake:r.stake,payout:String(st.payout),heads:st.heads,push:finished.args.push!,transaction:finished.transactionHash!};verifyCoinReceipt(result.receipt);}
 return result;
}
export async function readCoin(owner:Address){const c=await checked(),{d,r,records}=await houseTransaction(s=>({d:s.deployment,r:s.coins?.[owner.toLowerCase()],records:s.coinHistory?.[owner.toLowerCase()]??[]}));if(!d?.casinoVersion)return{round:null,history:[]};const[round,history]=await Promise.all([r?coinPublic(c,d,r):null,Promise.all(records.slice(0,20).map(v=>coinPublic(c,d,v)))]);return{round,history};}
