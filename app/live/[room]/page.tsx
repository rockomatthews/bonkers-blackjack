import Link from 'next/link';
import Image from 'next/image';
import {notFound} from 'next/navigation';
import Pilot from '../../crypto-pilot/ui';
import {ROOMS,liveRoomOpen,type RoomId} from '../../../shared/rooms';
import {cryptoPilotEnabled} from '../../../shared/crypto/access';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{room:string}>}){
 const {room}=await params;
 if(!cryptoPilotEnabled()||!Object.hasOwn(ROOMS,room))notFound();
 if(!liveRoomOpen(room)){
  const info=ROOMS[room as RoomId];
  return <main className="coming-soon-page"><Image src={info.image} alt={info.description} fill sizes="100vw" priority/><section><p className="live-eyebrow">HIGHER STAKES</p><h1>{info.name}</h1><h2>Coming soon</h2><p>This room is not accepting players or wagers yet.</p><Link className="live-button" href="/">Back to rooms</Link></section></main>;
 }
 return <Pilot roomId={room as RoomId}/>;
}
