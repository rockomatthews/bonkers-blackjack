'use client';
import {useEffect,useRef,useState} from 'react';
import type {CoinFace} from './coin-scene';
export default function Coin3D({face='heads',spinning=false}:{face?:CoinFace;spinning?:boolean}){
 const host=useRef<HTMLDivElement>(null),scene=useRef<Awaited<ReturnType<typeof import('./coin-scene').createCoinScene>>|null>(null),latest=useRef({face,spinning});
 const[ready,setReady]=useState(false);latest.current={face,spinning};
 useEffect(()=>{let cancelled=false;const node=host.current!;const fallback=()=>setReady(false);node.addEventListener('coin-context-lost',fallback);
  void import('./coin-scene').then(async({createCoinScene})=>{if(cancelled)return;const created=await createCoinScene(node,latest.current.face,latest.current.spinning);if(cancelled){created.dispose();return;}scene.current=created;created.update(latest.current.face,latest.current.spinning);setReady(true);}).catch(()=>{if(!cancelled)setReady(false);});
  return()=>{cancelled=true;node.removeEventListener('coin-context-lost',fallback);scene.current?.dispose();scene.current=null;};
 },[]);
 useEffect(()=>{scene.current?.update(face,spinning);},[face,spinning]);
 return <div className="coin-3d" role="img" aria-label={spinning?'3D coin flipping; result pending':`3D coin: ${face==='heads'?'red heads':'blue tails'} with a white edge`} data-renderer={ready?'threejs':'image'} data-face={face} data-spinning={spinning}>
  <img className="coin-3d-fallback" src={`/coins/${face==='heads'?'heads-red':'tails-blue'}.png`} alt="" hidden={ready}/><div className="coin-3d-canvas" ref={host} style={{visibility:ready?'visible':'hidden'}}/>
 </div>;
}
