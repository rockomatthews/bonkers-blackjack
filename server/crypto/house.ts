import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {createPublicClient,createWalletClient,http,erc20Abi,parseAbi,encodeAbiParameters,encodeDeployData,keccak256,isAddress,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {base} from 'viem/chains';
import {SignJWT,jwtVerify} from 'jose';
import {HOUSE_ADDRESS,HOUSE_RESERVE,INITIAL_WAGER,walletLoginMessage,type HouseStatus,type HouseRound,type HouseDeployment} from '../../shared/crypto/house';
import {BASE_USDC} from '../../shared/crypto/assets';
import {gameAbi} from '../../shared/crypto/game-abi';
import {vaultAbi} from '../../shared/crypto/vault';
import {replayEngine} from '../../shared/crypto/engines';
import {houseTransaction,houseStoreAvailable,type SavedRound,type HouseData} from './house-store';
import artifact from '../../shared/crypto/pilot-artifact.json';
const treasuryAbi=parseAbi(['function treasury() view returns(address)']);
const random=()=>`0x${randomBytes(32).toString('hex')}` as Hex;
function settings(){
 const key=process.env.BONKERS_DEALER_KEY;if(!key||!/^0x[0-9a-fA-F]{64}$/.test(key))throw Error('Dealer is being prepared. Deposits remain closed.');
 const rpc=process.env.BONKERS_RPC_URL??'https://mainnet.base.org';const url=new URL(rpc);if(url.protocol!=='https:'&&!(process.env.BONKERS_LOCAL_STORE==='1'&&!process.env.VERCEL&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Invalid Base RPC');
 const house=(process.env.BONKERS_HOUSE_ADDRESS??HOUSE_ADDRESS) as Address;if(!isAddress(house))throw Error('House address is invalid');
 const account=privateKeyToAccount(key as Hex),client=createPublicClient({chain:base,transport:http(rpc,{timeout:12000,retryCount:1}),pollingInterval:500}),wallet=createWalletClient({chain:base,account,transport:http(rpc,{timeout:12000,retryCount:0})});
 return{key,house,account,client,wallet};
}
function secretKey(){return createHash('sha256').update('bonkers-dealer-seeds-v1\0'+settings().key).digest();}
function seal(seed:Hex){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secretKey(),nonce);const body=Buffer.concat([cipher.update(seed,'utf8'),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),body]).toString('base64');}
function open(value:string){const b=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',secretKey(),b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString('utf8') as Hex;}
async function checked(){const c=settings();if(await c.client.getChainId()!==8453)throw Error('Wrong settlement chain');return c;}
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
  return{...common,dealerReady,houseBalance:String(houseBalance),reserved:String(reserved),dealerGas:String(dealerGas),depositsOpen:!paused&&dealerReady&&collateral&&solvent,reason:!solvent?'Vault reconciliation required.':!dealerReady?'Waiting for the house to fund dealer transaction fees.':!collateral?'Waiting for the house reserve to be funded.':paused?'Deposits are closed until the house wallet explicitly opens them.':'Deposits are open.'};
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
 await houseTransaction(s=>{if(s.deployment&&s.deployment.game.toLowerCase()!==game.toLowerCase())throw Error('A shared house table already exists');s.deployment={game,vault,block:String(receipt.blockNumber),transaction:hash};});return houseStatus();
}
async function send(c:Awaited<ReturnType<typeof checked>>,game:Address,functionName:'offerFor'|'start'|'observe'|'autoStand'|'settle'|'claimFailure',args:readonly unknown[]){const hash=await c.wallet.writeContract({address:game,abi:gameAbi,functionName,args} as Parameters<typeof c.wallet.writeContract>[0]);const receipt=await c.client.waitForTransactionReceipt({hash,timeout:25000});if(receipt.status!=='success')throw Error('Dealer transaction reverted');return hash;}
export async function offer(owner:Address){
 const status=await houseStatus();if(!status.depositsOpen||!status.deployment)throw Error(status.reason);const c=await checked();
 if(await c.client.readContract({address:status.deployment.vault,abi:vaultAbi,functionName:'available',args:[owner]})<5010000n)throw Error('Deposit at least 5.01 USDC before playing.');
 // Persist the seed before any chain write so retries/cold starts cannot lose it.
 const round=await houseTransaction(async s=>{const previous=s.rounds[owner.toLowerCase()];if(previous){const st=await c.client.readContract({address:status.deployment!.game,abi:gameAbi,functionName:'state',args:[previous.id]});if(st[0]!==5)return previous;}
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
   if(st[0]===0){const statusPaused=await c.client.readContract({address:d.vault,abi:vaultAbi,functionName:'paused'});if(statusPaused)throw Error('Deposits are closed');await send(c,d.game,'offerFor',[r.id,r.commitment,r.owner]);break;}
   if(st[0]===5)break;
   if(now>=st[1]){await send(c,d.game,st[0]===3?'autoStand':'claimFailure',[r.id]);continue;}
   if(st[0]===1){if(!st[4].length)break;if(st[4].length!==1||st[4][0].toLowerCase()!==owner.toLowerCase())throw Error('Unexpected player in round');await send(c,d.game,'start',[r.id]);continue;}
   if(st[0]===2){await send(c,d.game,'observe',[r.id,data.engine!.observation(data.model!)]);continue;}
   if(st[0]===4){await send(c,d.game,'settle',[r.id,data.seed!]);continue;}
   break;
  }
 });
}
export async function readRound(owner:Address):Promise<HouseRound|null>{
 const c=await checked(),saved=await houseTransaction(s=>({d:s.deployment,r:s.rounds[owner.toLowerCase()]}));if(!saved.d||!saved.r)return null;const{d,r}=saved;
 const data=await roundModel(c,d,r),{st}=data;const result:HouseRound={id:r.id,commitment:r.commitment,phase:st[0],deadline:String(st[1]),players:[...st[4]],stakes:st[5].map(String)};
 if(data.model){result.state=data.engine!.publicState(data.model);result.observation=data.engine!.observation(data.model);}
 if(st[0]===5){const finished=await c.client.getContractEvents({address:d.game,abi:gameAbi,eventName:'Finished',args:{id:r.id},fromBlock:BigInt(r.block),toBlock:'latest'});const last=finished.at(-1);if(last?.args.failure){result.failure=true;delete result.state;delete result.observation;}else if(last&&data.model){const observed=await c.client.getContractEvents({address:d.game,abi:gameAbi,eventName:'Observed',args:{id:r.id},fromBlock:BigInt(r.block),toBlock:'latest'});result.receipt={id:r.id,seed:data.seed!,commitment:r.commitment,entropy:st[3],stakes:st[5].map(String),actions:data.actions!,observations:observed.map(x=>x.args.data!),payouts:data.engine!.payouts(data.model,st[5]).map(String),settlementHash:last.transactionHash!};}}
 return result;
}
