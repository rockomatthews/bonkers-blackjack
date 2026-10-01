import {notFound} from 'next/navigation';
import Pilot from './ui';
import {cryptoPilotEnabled} from '../../shared/crypto/access';
export const dynamic='force-dynamic';
export const metadata={title:'Bonkers — Wallet Mainnet Test',robots:{index:false,follow:false}};
export default function Page(){if(!cryptoPilotEnabled())notFound();return <Pilot/>;}
