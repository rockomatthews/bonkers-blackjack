/** Deploys only to a fresh local Anvil chain with a mock token. Never contacts a public RPC. */
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createPublicClient,createWalletClient,http,defineChain,keccak256,toHex,parseAbi,type Hex,type Address} from 'viem';
import {gameAbi} from '../../shared/crypto/game-abi';
import {initial,shuffle,step,observation,payouts,legalMoves,total,extraStake} from '../../shared/crypto/replay';
import {verifyCryptoReceipt} from '../../shared/crypto/verify-receipt';
const rpc='http://127.0.0.1:18548';
const child=spawn('anvil',['--host','127.0.0.1','--port','18548','--chain-id','31337','--silent'],{stdio:'ignore'});
let spawnError:Error|undefined;child.on('error',e=>{spawnError=e;});
const chain=defineChain({id:31337,name:'Local rules verification',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpc]}}});
const client=createPublicClient({chain,transport:http(rpc,{retryCount:0}),pollingInterval:50});
const wallet=createWalletClient({chain,transport:http(rpc)});
try {
 for(let n=0;;n++){await new Promise(r=>setTimeout(r,100));if(spawnError)throw spawnError;if(child.exitCode!==null)throw Error('Fresh Anvil failed to start; refusing to use an existing node');try{await client.getChainId();break;}catch{if(n>50)throw Error('Local node startup timed out');}}
 assert.equal(await client.getChainId(),31337);assert.match(await client.request({method:'web3_clientVersion'}),/anvil/i);
 const [operator,player]=await wallet.getAddresses();
 async function confirmed(hash:Hex){const r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,'success');return r;}
 async function deploy(file:string,args:readonly unknown[]){const a=JSON.parse(await readFile(file,'utf8'));const r=await confirmed(await wallet.deployContract({account:operator,abi:a.abi,bytecode:a.bytecode.object,args}));assert(r.contractAddress);return r.contractAddress;}
 const exported=JSON.parse(await readFile('shared/crypto/pilot-artifact.json','utf8'));
 const compiled=JSON.parse(await readFile('contracts/out/BlackjackGame.sol/BlackjackGame.json','utf8'));
 assert.equal(exported.rulesVersion,2);assert.equal(exported.bytecode,compiled.bytecode.object);assert.equal(exported.creationCodeHash,keccak256(compiled.bytecode.object));
 const token=await deploy('contracts/out/PlayerVault.t.sol/VaultToken.json',[]);
 const game=await deploy('contracts/out/BlackjackGame.sol/BlackjackGame.json',[token,operator,operator]);
 assert.equal(await client.readContract({address:game,abi:gameAbi,functionName:'rulesVersion'}),2);
 const verifier=await client.readContract({address:game,abi:gameAbi,functionName:'verifier'});
 const verifierAbi=parseAbi(['function verify(bytes32 seed,bytes32 entropy,uint128[] stakes,(uint8 seat,uint8 move)[] actions,bytes32[] observations,uint128[] added) pure returns(uint128[])']);
 const counts:Record<string,number>={hit:0,stand:0,double:0,split:0,insurance:0,decline:0,surrender:0};let handCount=0;
 for(let n=0;n<64;n++){
  const seed=keccak256(toHex(`v2-seed-${n}`)),entropy=keccak256(toHex(`v2-entropy-${n}`)),deck=shuffle(seed,entropy),state=initial(deck,7);
  const actions:{seat:number;move:number}[]=[],obs:Hex[]=[],raw:Hex[]=[],added=Array<bigint>(7).fill(0n),stakes=Array.from({length:7},(_,i)=>BigInt(i+1)*1000000n);
  while(!state.done){
   const options=legalMoves(state);let move=2;
   if(state.insurance)move=(n+state.active)%3===0?5:(n+state.active)%3===1?6:2;
   else if(options.includes(7)&&n%4===1)move=7;
   else if(options.includes(4))move=4;
   else if(options.includes(3)&&n%2===0)move=3;
   else if(options.includes(1)&&total(state.seats[state.active].hands[state.seats[state.active].active].cards)<17)move=1;
   const a={seat:state.active,move},view=observation(state);raw.push(view);obs.push(keccak256(view));actions.push(a);
   counts[['','hit','stand','double','split','insurance','decline','surrender'][move]]++;
   added[a.seat]+=extraStake(move,stakes[a.seat]);step(state,deck,a);
  }
  raw.push(observation(state));obs.push(keccak256(observation(state)));const expected=payouts(state,stakes);
  const actual=await client.readContract({address:verifier,abi:verifierAbi,functionName:'verify',args:[seed,entropy,stakes,actions,obs,added]});assert.deepEqual(actual,expected);
  verifyCryptoReceipt({id:seed,seed,entropy,commitment:keccak256(toHex(new Uint8Array(Buffer.from(seed.slice(2),'hex')))),stakes:stakes.map(String),actions,observations:raw,payouts:expected.map(String),settlementHash:seed});
  handCount+=state.seats.reduce((sum,p)=>sum+p.hands.length,0);
  if(n===0){const bad=[...added];bad[0]+=1n;await assert.rejects(client.readContract({address:verifier,abi:verifierAbi,functionName:'verify',args:[seed,entropy,stakes,actions,obs,bad]}));}
 }
 for(const [move,count] of Object.entries(counts))assert(count>0,`No ${move} coverage`);
 // Exercise real game + vault transactions, not only eth_call replay.
 const vault=await client.readContract({address:game,abi:gameAbi,functionName:'vault'});
 const tokenAbi=parseAbi(['function mint(address,uint256)','function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)']);
 const vaultAbi=parseAbi(['function fundHouse(uint256)','function setPaused(bool)','function depositFor(address,uint256)','function available(address) view returns(uint256)','function accountedAssets() view returns(uint256)','function playerLocked() view returns(uint256)','function reserved() view returns(uint256)','function withdraw(uint256,address)']);
 async function write(account:Address,address:Address,abi:readonly unknown[],functionName:string,args:readonly unknown[]){return confirmed(await wallet.writeContract({account,address,abi,functionName,args} as Parameters<typeof wallet.writeContract>[0]));}
 await write(operator,token,tokenAbi,'mint',[operator,100000000000n]);await write(operator,token,tokenAbi,'approve',[vault,100000000000n]);await write(operator,vault,vaultAbi,'fundHouse',[100000000000n]);await write(operator,vault,vaultAbi,'setPaused',[false]);
 await write(operator,token,tokenAbi,'mint',[player,100000000n]);await write(player,token,tokenAbi,'approve',[vault,100000000n]);await write(operator,vault,vaultAbi,'depositFor',[player,100000000n]);
 const transactions:{case:string;settlementHash:Hex;payout:string;added:string}[]=[];
 for(const blackjack of [true,false]){
  const id=keccak256(toHex(`integration-${blackjack}`)),playerEntropy=keccak256(toHex('player entropy'));
  const {encodeAbiParameters}=await import('viem');const entropy=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'},{type:'bytes32'},{type:'bytes32[]'}],[game,31337n,id,[playerEntropy]]));
  let seed:Hex,deck:number[],state:ReturnType<typeof initial>;let n=0;
  do{seed=keccak256(toHex(`insurance-${n++}`));deck=shuffle(seed,entropy);state=initial(deck,1);}while(!state.insurance||(total(state.dealer)===21)!==blackjack||state.seats[0].hands[0].done);
  const before=await client.readContract({address:vault,abi:vaultAbi,functionName:'available',args:[player]});
  await write(operator,game,gameAbi,'offer',[id,keccak256(encodeAbiParameters([{type:'bytes32'}],[seed]))]);await write(player,game,gameAbi,'join',[id,5000000n,playerEntropy]);await write(operator,game,gameAbi,'start',[id]);
  const live=await client.readContract({address:game,abi:gameAbi,functionName:'state',args:[id]});assert.equal(live[3],entropy);
  await write(operator,game,gameAbi,'observe',[id,observation(state)]);await write(player,game,gameAbi,'act',[id,5,2500000n,keccak256(observation(state))]);step(state,deck,{seat:0,move:5});
  if(!state.done){await write(operator,game,gameAbi,'observe',[id,observation(state)]);await write(player,game,gameAbi,'act',[id,7,0n,keccak256(observation(state))]);step(state,deck,{seat:0,move:7});}
  await write(operator,game,gameAbi,'observe',[id,observation(state)]);const settlement=await write(operator,game,gameAbi,'settle',[id,seed]);
  const paid=payouts(state,[5000000n])[0];assert.equal(await client.readContract({address:vault,abi:vaultAbi,functionName:'available',args:[player]}),before-7510000n+paid);
  assert.equal(await client.readContract({address:vault,abi:vaultAbi,functionName:'reserved'}),0n);assert.equal(await client.readContract({address:vault,abi:vaultAbi,functionName:'playerLocked'}),0n);
  assert.equal(await client.readContract({address:vault,abi:vaultAbi,functionName:'accountedAssets'}),await client.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[vault]}));
  transactions.push({case:blackjack?'insured dealer blackjack':'insurance loss then late surrender',settlementHash:settlement.transactionHash,payout:String(paid),added:'2500000'});
 }
 const unlocked=await client.readContract({address:vault,abi:vaultAbi,functionName:'available',args:[player]});await write(player,vault,vaultAbi,'withdraw',[unlocked,player]);assert.equal(await client.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[player]}),unlocked);
 const result={network:'fresh local Anvil',chainId:31337,token:'mock USDC',rulesVersion:2,rounds:64,seats:448,hands:handCount,actions:counts,exactObservationAndPayoutMatches:true,tamperedAddedStakeRejected:true,transactions,withdrawalVerified:true,mainnetTransactions:0};
 await mkdir('docs/crypto/evidence',{recursive:true});await writeFile('docs/crypto/evidence/rules-v2-local.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{child.kill('SIGTERM');}
