import {assetNetwork,ASSET_NETWORKS,type AssetNetwork} from '../../shared/crypto/assets';
import {units} from '../../shared/crypto/money';
export type SwapQuote={depositAddress?:string;depositMemo?:string;amountIn:string;amountOut:string;minAmountOut:string;deadline:string;timeEstimate?:number};
export type ProviderToken={assetId:string;symbol:string;decimals:number;blockchain:string;contractAddress?:string};
/** Narrow adapter: no arbitrary upstream URLs, unknown assets or ANY_INPUT collection accounts. */
export class OneClick {
 constructor(private token:string,private approved:boolean,private fetcher:typeof fetch=fetch){}
 private async request(path:string,body?:unknown){
  const response=await this.fetcher('https://1click.chaindefuser.com/v0/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(this.token?{authorization:'Bearer '+this.token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw Error(`Conversion provider unavailable (${response.status})`);
  return response.json();
 }
 async tokens():Promise<ProviderToken[]>{
  const data=await this.request('tokens');if(!Array.isArray(data))throw Error('Invalid provider token list');return data;
 }
 async resolveAsset(asset:AssetNetwork){
  assetNetwork(asset);
  const [symbol,network]=asset.split(':');const blockchain=({bitcoin:'btc',ethereum:'eth',solana:'sol',base:'base'} as Record<string,string>)[network];
  const candidates=(await this.tokens()).filter(t=>t.symbol===symbol && t.blockchain===blockchain);
  const expected=ASSET_NETWORKS[asset];
  const filtered=candidates.filter(t=>typeof t.assetId==='string' && t.assetId.length>0 && t.decimals===expected.decimals &&
   ('contract' in expected ? t.contractAddress?.toLowerCase()===expected.contract.toLowerCase() : !t.contractAddress));
  if(filtered.length!==1)throw Error('Asset route requires verified unambiguous provider metadata');
  return filtered[0];
 }
 async quote(input:{origin:AssetNetwork;destination:AssetNetwork;amount:string;recipient:string;refundTo:string;dry:boolean}):Promise<SwapQuote>{
  if(!input.dry&&!this.approved)throw Error('Conversion provider business approval is required');
  if(units(input.amount)<=0n)throw Error('Amount must be positive');
  if(!input.recipient||!input.refundTo)throw Error('Recipient and refund destination are required');
  const [origin,destination]=await Promise.all([this.resolveAsset(input.origin),this.resolveAsset(input.destination)]);
  const deadline=new Date(Date.now()+15*60_000).toISOString();
  const data=await this.request('quote',{dry:input.dry,swapType:'EXACT_INPUT',slippageTolerance:50,originAsset:origin.assetId,destinationAsset:destination.assetId,
   depositType:'ORIGIN_CHAIN',recipientType:'DESTINATION_CHAIN',refundType:'ORIGIN_CHAIN',amount:input.amount,recipient:input.recipient,refundTo:input.refundTo,deadline});
  const q=data.quote;
  if(!q||typeof q.amountIn!=='string'||typeof q.amountOut!=='string'||typeof q.minAmountOut!=='string')throw Error('Malformed conversion quote');
  if(units(q.amountIn)!==units(input.amount)||units(q.amountOut)<=0n||units(q.minAmountOut)<=0n||units(q.minAmountOut)>units(q.amountOut))throw Error('Invalid conversion amounts');
  const expiry=q.deadline??deadline;
  if(typeof expiry!=='string'||!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=Date.now()||Date.parse(expiry)>Date.parse(deadline))throw Error('Invalid quote deadline');
  if(!input.dry&&(typeof q.depositAddress!=='string'||!q.depositAddress.trim()))throw Error('Provider did not return a deposit address');
  return {depositAddress:q.depositAddress,depositMemo:q.depositMemo,amountIn:q.amountIn,amountOut:q.amountOut,minAmountOut:q.minAmountOut,deadline:q.deadline??deadline,timeEstimate:q.timeEstimate};
 }
 async status(depositAddress:string,depositMemo?:string){
  const params=new URLSearchParams({depositAddress});if(depositMemo)params.set('depositMemo',depositMemo);
  return this.request('status?'+params);
 }
}
