import {notFound} from 'next/navigation';
import CryptoLab from './ui';
export const dynamic='force-dynamic';
export const metadata={title:'Bonkers — Private Crypto Lab',robots:{index:false,follow:false}};
export default function Page(){if(process.env.CRYPTO_LAB_ENABLED!=='1'||process.env.VERCEL)notFound();return <CryptoLab/>;}
