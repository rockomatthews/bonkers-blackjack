import type {EIP1193Provider} from 'viem';
export type WalletOption={id:string;name:string;provider:EIP1193Provider;base:boolean};
type Injected=EIP1193Provider&{isCoinbaseWallet?:boolean;isMetaMask?:boolean;isPhantom?:boolean;providers?:Injected[]};
type WalletWindow=Window&{ethereum?:Injected;coinbaseWalletExtension?:Injected;phantom?:{ethereum?:Injected}};
export function discoverWallets(onChange:(wallets:WalletOption[])=>void){
 const found=new Map<EIP1193Provider,WalletOption&{announced:boolean;brand?:string}>();const w=window as WalletWindow;
 function publish(){onChange([...found.values()].sort((a,b)=>Number(b.base)-Number(a.base)));}
 function add(provider:Injected|undefined,id:string,name:string,isBase=false,announced=false){
  if(!provider?.request)return;
  const brand=isBase?'base':provider.isPhantom||/^phantom$/i.test(name)?'phantom':/^metamask$/i.test(name)||provider.isMetaMask?'metamask':undefined;
  // A wallet may expose different wrappers through legacy injection and EIP-6963.
  // Keep its announced provider, while retaining separately named wallet extensions.
  const duplicate=brand?[...found.entries()].find(([p,v])=>p!==provider&&v.brand===brand):undefined;
  if(duplicate){if(!announced||duplicate[1].announced)return;found.delete(duplicate[0]);}
  const current=found.get(provider);if(current?.announced&&!announced)return;
  found.set(provider,{id,name,provider,base:isBase,announced,brand});publish();
 }
 function announce(e:Event){const detail=(e as CustomEvent).detail;if(!detail?.info||!detail?.provider?.request)return;const {name,rdns,uuid}=detail.info;if(typeof name!=='string'||typeof rdns!=='string'||typeof uuid!=='string')return;const isBase=['com.coinbase.wallet','com.coinbase.wallet.extension','org.base.wallet','app.base'].includes(rdns)||/^(base|coinbase)\b/i.test(name);add(detail.provider,uuid,isBase?'Base / Coinbase Wallet':name.slice(0,60),isBase,true);}
 window.addEventListener('eip6963:announceProvider',announce);window.dispatchEvent(new Event('eip6963:requestProvider'));
 add(w.coinbaseWalletExtension,'legacy-base','Base / Coinbase Wallet',true);
 for(const p of w.ethereum?.providers??(w.ethereum?[w.ethereum]:[]))add(p,'legacy-'+found.size,p.isCoinbaseWallet?'Base / Coinbase Wallet':p.isPhantom?'Phantom':p.isMetaMask?'MetaMask':'Browser wallet',!!p.isCoinbaseWallet);
 add(w.phantom?.ethereum,'legacy-phantom','Phantom');
 return()=>window.removeEventListener('eip6963:announceProvider',announce);
}
