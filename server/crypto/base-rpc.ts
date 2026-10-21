import {fallback,http} from 'viem';
export function baseRpcTransport(url:string){
 const primary=http(url,{timeout:3500,retryCount:0});
 // Keep all local tests on their disposable chain. Production falls back only to Base.
 if(['localhost','127.0.0.1'].includes(new URL(url).hostname)||url==='https://base-rpc.publicnode.com')return primary;
 const publicNode=http('https://base-rpc.publicnode.com',{timeout:7000,retryCount:0});
 return fallback(new URL(url).hostname==='mainnet.base.org'?[publicNode,primary]:[primary,publicNode],{retryCount:0});
}
