import Image from 'next/image';
import Link from 'next/link';
import {ROOMS} from '../shared/rooms';
import './live.css';
export default function LiveLobby(){
 return <main className="live-home">
  <header className="live-header"><Link href="/" className="live-brand"><Image src="/bonkers-blackjack-logo.png" alt="Bonkers Blackjack" width={80} height={80}/><span>BONKERS<small>BLACKJACK</small></span></Link><span className="live-network">USDC · BASE</span><Link href="/live/bonkers-room?cashier=1" className="live-button">Connect wallet</Link></header>
  <section className="live-intro"><div><p className="live-eyebrow">YOUR WALLET. YOUR TABLE.</p><h1>A little mad.<br/><span>All blackjack.</span></h1><p>Pick your room. Deposit USDC on Base and put your cards on the table.</p><p className="live-intro-note">First wallet test: your connected wallet funds the house reserve and player balance. Wagers start at 5 USDC.</p></div><Image src="/bonkers-blackjack-logo.png" alt="Bonkers Blackjack grinning dog logo" width={450} height={450} priority/></section>
  <section className="live-rooms" aria-label="Choose a room">{Object.entries(ROOMS).map(([id,room])=><Link key={id} className="live-room-card" href={`/live/${id}`} aria-label={`Enter ${room.name}`} prefetch={false}><div className="live-room-picture"><Image src={room.image} alt={room.description} fill sizes="(max-width: 700px) 100vw, 33vw" loading="eager"/><span>{room.label}</span></div><div className="live-room-caption"><h2>{room.name}</h2><p>5 USDC initial wager · Blackjack pays 3:2</p><strong>Enter room</strong></div></Link>)}</section>
  <footer className="live-footer"><p>Native USDC on Base. Each transaction requires your wallet confirmation. Contracts are unaudited.</p><p>18+ · Insurance · Splitting · Doubling · Late surrender</p></footer>
 </main>;
}
