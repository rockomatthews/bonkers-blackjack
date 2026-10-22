import {decodeFunctionData,isHex,parseTransaction,recoverTransactionAddress,type Address,type Hex} from 'viem';
import {checked,progress,readRoundById} from './house';
import {houseTransaction} from './house-store';
import {gameAbi} from '../../shared/crypto/game-abi';
const reads=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getTransactionCount','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBalance','eth_call','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory']);
export async function validatePlayerTransaction(raw:Hex,owner:Address,game:Address){
 const tx=parseTransaction(raw);
 if(tx.chainId!==8453||tx.to?.toLowerCase()!==game.toLowerCase()||(tx.value??0n)!==0n||!tx.data)throw Error('Invalid gameplay transaction destination');
 const decoded=decodeFunctionData({abi:gameAbi,data:tx.data});
 if(!['joinFor','actFor'].includes(decoded.functionName)||decoded.args?.[1]?.toString().toLowerCase()!==owner.toLowerCase())throw Error('Invalid gameplay transaction owner');
 return recoverTransactionAddress({serializedTransaction:raw as Parameters<typeof recoverTransactionAddress>[0]['serializedTransaction']});
}
/** Authenticated Base RPC for browser-local signing. Never receives a private key. */
export async function playerRpc(owner:Address,method:unknown,params:unknown){
 if(typeof method!=='string'||!Array.isArray(params)||(!reads.has(method)&&method!=='eth_sendRawTransaction'))throw Error('Invalid gameplay RPC request');
 const c=await checked();
 if(method==='eth_sendRawTransaction'){
  const raw=params[0];if(params.length!==1||!isHex(raw))throw Error('Invalid signed gameplay transaction');
  const d=await houseTransaction(s=>s.deployment);if(!d)throw Error('Table deployment is unavailable');const signer=await validatePlayerTransaction(raw as Hex,owner,d.game);
  const [session,block]=await Promise.all([c.client.readContract({address:d.game,abi:gameAbi,functionName:'sessions',args:[signer]}),c.client.getBlock()]);
  if(session[0].toLowerCase()!==owner.toLowerCase()||session[2]<=block.timestamp)throw Error('Table approval expired. Bring an amount to the table again.');
 }
 return c.client.request({method,params} as never);
}

/** Advance the dealer after an accepted player transaction, even if that browser stops polling. */
export async function advanceGameplay(owner:Address,raw:Hex,hash:Hex){
 try{const c=await checked(),tx=parseTransaction(raw),decoded=decodeFunctionData({abi:gameAbi,data:tx.data!}),id=decoded.args![0] as Hex;
  const receipt=await c.client.waitForTransactionReceipt({hash,timeout:25000});if(receipt.status!=='success')return;
  for(let i=0;i<1;i++){await progress(owner,id);const round=await readRoundById(owner,id);if(!round||round.phase===3||round.phase===5||round.unavailable)break;}
 }catch(e){console.error('bonkers-dealer-advance',{error:e instanceof Error?e.name:'UnknownError'});}
}
