import {notFound} from 'next/navigation';
import Pilot from '../../crypto-pilot/ui';
import {ROOMS,type RoomId} from '../../../shared/rooms';
import {cryptoPilotEnabled} from '../../../shared/crypto/access';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{room:string}>}){
 const {room}=await params;
 if(!cryptoPilotEnabled()||!Object.hasOwn(ROOMS,room))notFound();
 return <Pilot roomId={room as RoomId}/>;
}
