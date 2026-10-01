import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createPublicClient,createWalletClient,http,defineChain,keccak256,encodeAbiParameters,type Hex} from 'viem';
import {gameAbi} from '../../shared/crypto/game-abi';
import {initial,shuffle,step,observation,publicState,legalMoves,payouts} from '../../shared/crypto/replay';
import type {LabConfig,LabReceipt} from '../../server/crypto/lab-types';
const dir=process.env.CRYPTO_LAB_DIR??'.data/crypto-lab';
const config:LabConfig=JSON.parse(await readFile(`${dir}/config.json`,'utf8'));
if(config.chainId!==31337||!['localhost','127.0.0.1'].includes(new URL(config.rpc).hostname))throw Error('Worker is local fork only');
const chain=defineChain({id:31337,name:'Bonkers local Base fork',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[config.rpc]}}});
const client=createPublicClient({chain,transport:http(config.rpc)}),wallet=createWalletClient({chain,transport:http(config.rpc),account:config.operator});
if(await client.getChainId()!==31337)throw Error('Wrong chain');
const metadata=await client.request({method:'web3_clientVersion'});if(!metadata.toLowerCase().includes('anvil'))throw Error('Anvil required');
await mkdir(`${dir}/receipts`,{recursive:true});
async function save(file:string,value:unknown){await writeFile(`${dir}/${file}.tmp`,JSON.stringify(value),{mode:0o600});await rename(`${dir}/${file}.tmp`,`${dir}/${file}`);}
let current:{id:Hex;seed:Hex;commitment:Hex};
try{current=JSON.parse(await readFile(`${dir}/seed.json`,'utf8'));}catch{current={id:'0x',seed:'0x',commitment:'0x'};}
async function send(functionName:'offer'|'start'|'observe'|'autoStand'|'settle'|'claimFailure',args:readonly unknown[]){
 const hash=await wallet.writeContract({address:config.game,abi:gameAbi,functionName,args} as Parameters<typeof wallet.writeContract>[0]);
 const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw Error(`${functionName} reverted`);return hash;
}
let completedAt=0;
async function tick(){
 if(current.id==='0x'){
  const seed=`0x${randomBytes(32).toString('hex')}` as Hex,id=`0x${randomBytes(32).toString('hex')}` as Hex;
  current={id,seed,commitment:keccak256(encodeAbiParameters([{type:'bytes32'}],[seed]))};await save('seed.json',current);
 }
 const [phase,deadline,active,entropy,players,stakes,,actionCount]=await client.readContract({address:config.game,abi:gameAbi,functionName:'state',args:[current.id]});
 if(phase===0){await send('offer',[current.id,current.commitment]);return;}
 const now=(await client.getBlock()).timestamp;
 const common={id:current.id,commitment:current.commitment,phase,deadline:deadline.toString(),players,stakes:stakes.map(String),workerUpdatedAt:Date.now(),mode:'local Base mainnet fork — no real funds'};
 if(phase===1){await save('state.json',common);if(now>=deadline){await send('claimFailure',[current.id]);}else if(players.length>0){await send('start',[current.id]);}return;}
 if(phase===5){
  const existing=JSON.parse(await readFile(`${dir}/state.json`,'utf8').catch(()=>'{"phase":0}'));
  if(existing.id!==current.id||existing.phase!==5){
   let receipt:LabReceipt|undefined;try{receipt=JSON.parse(await readFile(`${dir}/receipts/${current.id}.json`,'utf8'));}catch{}
   await save('state.json',{...common,phase:5,receipt,recoveryNotice:receipt?undefined:'Round closed on chain; receipt may need reconstruction from events.'});
  }
  if(!completedAt)completedAt=Date.now();if(Date.now()-completedAt>12000){current={id:'0x',seed:'0x',commitment:'0x'};completedAt=0;}return;}
 const actions=await client.getContractEvents({address:config.game,abi:gameAbi,eventName:'Acted',args:{id:current.id},fromBlock:BigInt(config.startBlock),toBlock:'latest'});
 if(BigInt(actions.length)!==actionCount)throw Error('Incomplete action history');
 const deck=shuffle(current.seed,entropy),state=initial(deck,players.length);
 const transcript=actions.map(a=>({seat:a.args.seat!,move:a.args.move!}));
 for(const a of transcript)step(state,deck,a);
 const data=observation(state);
 await save('state.json',{...common,entropy,active,state:publicState(state),legalMoves:legalMoves(state),observation:data});
 if(phase===2){if(now>=deadline)await send('claimFailure',[current.id]);else await send('observe',[current.id,data]);}
 if(phase===3&&now>=deadline)await send('autoStand',[current.id]);
 if(phase===4){
  if(now>=deadline){await send('claimFailure',[current.id]);return;}
  const settlementHash=await send('settle',[current.id,current.seed]);
  const observed=await client.getContractEvents({address:config.game,abi:gameAbi,eventName:'Observed',args:{id:current.id},fromBlock:BigInt(config.startBlock),toBlock:'latest'});
  const receipt:LabReceipt={id:current.id,seed:current.seed,commitment:current.commitment,entropy,stakes:stakes.map(String),actions:transcript,observations:observed.map(o=>o.args.data!),payouts:payouts(state,stakes).map(String),settlementHash};
  await save(`receipts/${current.id}.json`,receipt);await save('state.json',{...common,phase:5,state:publicState(state),receipt,workerUpdatedAt:Date.now()});
 }
}
console.log('Private local-fork dealer worker started. No mainnet signer loaded.');
for(;;){try{await tick();}catch(error){console.error('Worker paused this tick:',error instanceof Error?error.message:'Unknown failure');await save('health.json',{ok:false,at:Date.now()});}await new Promise(r=>setTimeout(r,1000));}
