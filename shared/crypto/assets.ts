import {getAddress, type Address} from 'viem';
export const BASE_CHAIN_ID=8453;
export const BASE_USDC=getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
export const ASSET_NETWORKS = {
  'USDC:base':{symbol:'USDC',network:'Base',decimals:6,chainId:8453,contract:BASE_USDC},
  'BTC:bitcoin':{symbol:'BTC',network:'Bitcoin',decimals:8},
  'ETH:ethereum':{symbol:'ETH',network:'Ethereum',decimals:18,chainId:1},
  'SOL:solana':{symbol:'SOL',network:'Solana',decimals:9},
  'USDT:ethereum':{symbol:'USDT',network:'Ethereum',decimals:6,chainId:1,contract:getAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')},
} as const;
export type AssetNetwork=keyof typeof ASSET_NETWORKS;
export function assetNetwork(value:unknown):AssetNetwork {
  if(typeof value!=='string' || !Object.hasOwn(ASSET_NETWORKS,value))throw Error('Unsupported asset/network');
  return value as AssetNetwork;
}
export function address(value:unknown):Address {
  if(typeof value!=='string')throw Error('Invalid address');
  const parsed=getAddress(value);
  if(parsed==='0x0000000000000000000000000000000000000000')throw Error('Zero address is not allowed');
  return parsed;
}
