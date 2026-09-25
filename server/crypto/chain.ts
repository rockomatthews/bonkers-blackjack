import {createPublicClient,http,erc20Abi,encodeFunctionData,decodeEventLog,type Address,type Hash} from 'viem';
import {base} from 'viem/chains';
import {vaultAbi} from '../../shared/crypto/vault';
import {BASE_CHAIN_ID,BASE_USDC,address} from '../../shared/crypto/assets';
import {units} from '../../shared/crypto/money';
import type {CryptoConfig} from './config';
export class BaseChain {
 readonly client;
 constructor(readonly config:CryptoConfig){this.client=createPublicClient({chain:base,transport:http(config.rpc,{retryCount:1,timeout:10000})});}
 async verifyDeployment(){
  if(await this.client.getChainId()!==BASE_CHAIN_ID)throw Error('Wrong settlement chain');
  if(!this.config.vault)throw Error('Vault not configured');
  const token=await this.client.readContract({address:this.config.vault,abi:vaultAbi,functionName:'token'});
  if(token.toLowerCase()!==BASE_USDC.toLowerCase())throw Error('Vault token mismatch');
 }
 async balances(owner:Address){
  await this.verifyDeployment();
  const vault=this.config.vault!;
  const [finalBlock,latestBlock]=await Promise.all([this.client.getBlock({blockTag:'finalized'}),this.client.getBlockNumber()]);
  const [confirmed,latest,wallet]=await Promise.all([
   this.client.readContract({address:vault,abi:vaultAbi,functionName:'available',args:[owner],blockNumber:finalBlock.number}),
   this.client.readContract({address:vault,abi:vaultAbi,functionName:'available',args:[owner],blockNumber:latestBlock}),
   this.client.readContract({address:BASE_USDC,abi:erc20Abi,functionName:'balanceOf',args:[owner],blockNumber:latestBlock}),
  ]);
  return {asset:'USDC',network:'Base',available:(confirmed<latest?confirmed:latest).toString(),latestAvailable:latest.toString(),wallet:wallet.toString(),finalizedBlock:finalBlock.number.toString(),latestBlock:latestBlock.toString()};
 }
 depositTransaction(owner:Address,amount:string){
  if(!this.config.vault)throw Error('Vault missing');if(units(amount)<=0n)throw Error('Invalid amount');
  return {chainId:BASE_CHAIN_ID,to:this.config.vault,data:encodeFunctionData({abi:vaultAbi,functionName:'depositFor',args:[owner,units(amount)]}),value:'0'};
 }
 withdrawalTransaction(owner:Address,recipient:Address,amount:string){
  if(!this.config.vault)throw Error('Vault missing');if(units(amount)<=0n)throw Error('Invalid amount');
  return {chainId:BASE_CHAIN_ID,from:owner,to:this.config.vault,data:encodeFunctionData({abi:vaultAbi,functionName:'withdraw',args:[units(amount),recipient]}),value:'0'};
 }
 async depositEvidence(hash:Hash,owner:Address){
  await this.verifyDeployment();
  const receipt=await this.client.getTransactionReceipt({hash});
  if(receipt.status!=='success')throw Error('Deposit transaction reverted');
  const [finalBlock,canonical,head]=await Promise.all([this.client.getBlock({blockTag:'finalized'}),this.client.getBlock({blockNumber:receipt.blockNumber}),this.client.getBlockNumber()]);
  if(canonical.hash!==receipt.blockHash)throw Error('Deposit reorg detected');
  if(receipt.blockNumber>finalBlock.number||head-receipt.blockNumber+1n<this.config.chainConfirmations)throw Error('Deposit awaiting finality');
  return receipt.logs.filter(log=>log.address.toLowerCase()===this.config.vault!.toLowerCase()).flatMap(log=>{
   try{const event=decodeEventLog({abi:vaultAbi,data:log.data,topics:log.topics,eventName:'Deposited'});
    if(address(event.args.owner)!==owner)return [];
    return [{chainId:BASE_CHAIN_ID,token:BASE_USDC,recipient:owner,amount:event.args.amount.toString(),transactionHash:hash,logIndex:log.logIndex,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber.toString()}];
   }catch{return [];}
  });
 }
 async reconcile(){
  await this.verifyDeployment();const vault=this.config.vault!,block=await this.client.getBlock({blockTag:'finalized'});
  const [assets,accounted,house,reserved]=await Promise.all([
   this.client.readContract({address:BASE_USDC,abi:erc20Abi,functionName:'balanceOf',args:[vault],blockNumber:block.number}),
   this.client.readContract({address:vault,abi:vaultAbi,functionName:'accountedAssets',blockNumber:block.number}),
   this.client.readContract({address:vault,abi:vaultAbi,functionName:'house',blockNumber:block.number}),
   this.client.readContract({address:vault,abi:vaultAbi,functionName:'reserved',blockNumber:block.number}),
  ]);
  return {solvent:assets>=accounted && house>=reserved,assets:assets.toString(),accounted:accounted.toString(),unallocated:(assets-accounted).toString(),house:house.toString(),reserved:reserved.toString(),block:block.number.toString()};
 }
}
