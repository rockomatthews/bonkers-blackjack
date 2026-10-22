import {isAddress,type Address} from 'viem';

// The address is a tab-local selector, never an authentication credential.
// The server still verifies the matching HttpOnly signed session cookie.
export function selectRequestWallet(owner:Address){sessionStorage.setItem('bonkers-api-wallet',owner.toLowerCase());}
export function walletRequestHeaders(json=false):Record<string,string>{
 const headers:Record<string,string>=json?{'Content-Type':'application/json'}:{};
 const owner=typeof window==='undefined'?null:sessionStorage.getItem('bonkers-api-wallet');
 if(owner&&isAddress(owner))headers['X-Bonkers-Wallet']=owner;
 return headers;
}
