import {fallback,http} from 'viem';
export function baseRpcTransport(url:string){
 const primary=http(url,{timeout:12000,retryCount:0});
 // Keep all local tests on their disposable chain. Production falls back only to Base.
 if(['localhost','127.0.0.1'].includes(new URL(url).hostname)||url==='https://base-rpc.publicnode.com')return primary;
 return fallback([primary,http('https://base-rpc.publicnode.com',{timeout:12000,retryCount:0})],{retryCount:0});
}
