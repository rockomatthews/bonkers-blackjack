'use client';
import {useEffect,useRef,type ReactNode} from 'react';
export default function WalletDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 return <dialog className="wallet-dialog" ref={ref} aria-label={title} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="wallet-dialog-content"><header><h2>{title}</h2><button onClick={onClose} className="live-button quiet">Close</button></header>{children}</div></dialog>;
}
