import Link from 'next/link';
import Pilot from '../app/crypto-pilot/ui';
import Image from 'next/image';
import {houseStatus} from '../server/crypto/house';
import {formatUSDC} from '../shared/crypto/money';
import './live.css';
import GameCarousel from './GameCarousel';
export default async function LiveLobby(){
 const house=await houseStatus();
 return <main className="casino-home">
  <header className="casino-header"><Link href="/" className="casino-home-logo"><Image src="/bonkers-logo.png" alt="Bonkers" width={1280} height={1280} sizes="120px"/></Link><nav aria-label="Main navigation"><a href="#games">Games</a><Pilot game="lobby"/></nav></header>
  <GameCarousel/>
  <section className="casino-bankroll"><div><p className="live-eyebrow">HOUSE RESERVES</p><h2>Game reserves</h2><p>Each game reserves the house collateral required for every accepted wager. Blackjack and shared Toin Coss use separate vaults; existing balances remain withdrawable from their own cashier.</p></div><dl><div><dt>Unreserved Blackjack USDC</dt><dd>{house.freeCollateral?formatUSDC(BigInt(house.freeCollateral)).replace(/(\.\d{2})0+$/,'$1'):'—'}</dd></div><div><dt>Dealer round limit</dt><dd>{house.activeLimit??10}<small> maximum concurrent rounds</small></dd></div></dl></section>
  <footer className="casino-footer"><Link className="casino-wordmark" href="/">BONKERS</Link><p>18+ · Native USDC on Base · Wallet confirmation required.<br/>Contracts are unaudited. Deposits open only with the house wallet’s authorization.</p></footer>
 </main>;
}
