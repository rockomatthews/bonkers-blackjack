'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';

const games=[
 {name:'Blackjack',href:'/blackjack',label:'Play Blackjack',description:'Hit, stand, double and split at your own table.',details:'$1 and $5 chips · Blackjack pays 3:2',kind:'blackjack'},
 {name:'Bonkers Toin Coss',href:'/toin-coss',label:'Play Bonkers Toin Coss',description:'Choose heads or tails. Play a single toss or a majority wager.',details:'1–5 USDC wagers · Heads or tails',kind:'toss'},
] as const;
export default function GameCarousel(){
 const track=useRef<HTMLDivElement>(null);const[active,setActive]=useState(0);
 function select(index:number){const next=(index+games.length)%games.length;const el=track.current;if(el)el.scrollTo({left:next*el.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 return <section id="games" className="game-carousel" aria-label="Available games" aria-roledescription="carousel">
  <div className="game-carousel-heading"><h1>Games</h1><div className="game-carousel-arrows"><button type="button" aria-label="Previous game" onClick={()=>select(active-1)}>←</button><button type="button" aria-label="Next game" onClick={()=>select(active+1)}>→</button></div></div>
  <div className="game-carousel-track" ref={track} tabIndex={0} aria-label="Game slides" onScroll={event=>{const el=event.currentTarget;setActive(Math.round(el.scrollLeft/el.clientWidth));}} onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();select(active+(event.key==='ArrowRight'?1:-1));}}}>
   {games.map((game,index)=><article key={game.kind} className={`game-carousel-slide ${game.kind}`} role="group" aria-roledescription="slide" aria-label={`${index+1} of ${games.length}: ${game.name}`} aria-hidden={active!==index} inert={active!==index}>
    <div className="game-carousel-art" aria-hidden="true">{game.kind==='blackjack'?<Image src="/pokerRoom.png" alt="" fill sizes="(max-width: 750px) 100vw, 1250px" priority/>:<><Image className="carousel-coin heads" src="/coins/heads-red.png" alt="" width={832} height={832} sizes="(max-width: 750px) 190px, 350px"/><Image className="carousel-coin tails" src="/coins/tails-blue.png" alt="" width={832} height={832} sizes="(max-width: 750px) 190px, 350px"/></>}</div>
    <div className="game-carousel-copy"><span className="game-carousel-number">0{index+1} / 0{games.length}</span><h2>{game.name}</h2><p>{game.description}</p><small>{game.details}</small><Link className="live-button" href={game.href} aria-label={game.label}>{game.kind==='blackjack'?'Play Blackjack':'Play Toin Coss'} <span aria-hidden="true">↗</span></Link></div>
   </article>)}
  </div>
  <div className="game-carousel-pagination" aria-label="Choose a game">{games.map((game,index)=><button type="button" key={game.kind} aria-label={`Show ${game.name}`} aria-pressed={active===index} onClick={()=>select(index)}><span/>{game.name}</button>)}<small>USDC on Base</small></div>
 </section>;
}
