'use client';
import {useEffect,useState} from 'react';
import {discoverWallets,type WalletOption} from '../shared/crypto/wallets';
import WalletDialog from './WalletDialog';
export default function WalletChooser({onSelect,onClose}:{onSelect:(wallet:WalletOption)=>void;onClose:()=>void}){
 const[wallets,setWallets]=useState<WalletOption[]>([]);useEffect(()=>discoverWallets(setWallets),[]);
 const base=wallets.find(w=>w.base);
 return <WalletDialog title="Connect wallet" onClose={onClose}><p>Choose the wallet you want to use on Base. You control each approval and transaction.</p><div className="wallet-choices"><button className="live-button" disabled={!base} onClick={()=>base&&onSelect(base)}>Base / Coinbase Wallet{!base?' · Not detected':''}</button>{wallets.filter(w=>!w.base).map(w=><button className="live-button quiet" key={w.id} onClick={()=>onSelect(w)}>{w.name}</button>)}</div>{!base&&<p>Base extension not detected in this browser. Open this site in the browser where it is installed, unlock the extension, then reopen this chooser. <a href="https://www.coinbase.com/wallet/downloads" target="_blank" rel="noreferrer">Get the Base / Coinbase Wallet extension</a></p>}<p>No wallet will be selected automatically.</p></WalletDialog>;
}
