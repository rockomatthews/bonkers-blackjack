import Image from 'next/image';
import Link from 'next/link';
import {ROOMS,liveRoomOpen} from '../shared/rooms';
import './live.css';
import {houseStatus} from '../server/crypto/house';
export default async function BlackjackLobby(){
 const status=await houseStatus();
 return <main className="live-home">
  <header className="live-header"><Link href="/" className="live-brand"><Image src="/bonkers-blackjack-logo.png" alt="Bonkers Blackjack" width={80} height={80}/><span>BONKERS<small>BLACKJACK</small></span></Link><span className="live-network">USDC · BASE</span><Link href="/live/bonkers-room?connect=1" className="live-button">Connect wallet</Link></header>
  <section className="live-intro"><div><p className="live-eyebrow">ONE HOUSE. YOUR WALLET.</p><h1>A little mad.<br/><span>All blackjack.</span></h1><p>Pick your room. Bring your wallet. Play with native USDC on Base.</p><p className="live-intro-note">{status.depositsOpen?'Deposits are open. Connect your wallet to deposit and play.':'Deposits are closed until the house wallet funds the reserve and explicitly opens them.'} Wagers start at 1 USDC.</p>{!process.env.VERCEL&&!status.dealer&&<p><a className="live-button quiet" href="https://bonkers-blackjack.vercel.app/">Open hosted site</a></p>}</div><Image src="/bonkers-blackjack-logo.png" alt="Bonkers Blackjack grinning dog logo" width={450} height={450} priority/></section>
  <section className="live-rooms" aria-label="Choose a room">{Object.entries(ROOMS).map(([id,room])=>{
   const open=liveRoomOpen(id);
   const content=<><div className="live-room-picture"><Image src={room.image} alt={room.description} fill sizes="(max-width: 700px) 100vw, 33vw" loading="eager"/><span>{room.label}</span>{!open&&<b className="coming-soon-badge">Coming soon</b>}</div><div className="live-room-caption"><h2>{room.name}</h2><p>{open?'$1 and $5 chips · Blackjack pays 3:2':'Higher stakes · Opening later'}</p><strong>{open?'Enter room':'Coming soon'}</strong></div></>;
   return open?<Link key={id} className="live-room-card" href={`/live/${id}`} aria-label={`Enter ${room.name}`} prefetch={false}>{content}</Link>:<article key={id} className="live-room-card coming-soon-card" aria-label={`${room.name} — Coming soon`}>{content}</article>;
  })}</section>
  <footer className="live-footer"><p>Native USDC on Base. Each transaction requires your wallet confirmation. Contracts are unaudited.</p><p>18+ · Insurance · Splitting · Doubling · Late surrender</p></footer>
 </main>;
}
