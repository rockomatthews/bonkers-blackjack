import {randomUUID} from 'node:crypto';
import {communityTransaction,communityRead} from './community-store';
import {CHAT_ROOMS,chatText,type ChatRoom,type ChatMessage} from '../shared/chat';
export function validRoom(value:string|null):ChatRoom{if(!CHAT_ROOMS.includes(value as ChatRoom))throw Error('Unknown chat room');return value as ChatRoom;}
export async function readChat(room:ChatRoom){return (await communityRead('chat-'+room,()=>({messages:[] as ChatMessage[]}))).messages.slice(-100);}
export async function postChat(room:ChatRoom,owner:string,input:unknown,now=Date.now()){
 const text=chatText(input);return communityTransaction('chat-'+room,()=>({messages:[] as ChatMessage[]}),s=>{const previous=[...s.messages].reverse().find(m=>m.owner===owner.toLowerCase());if(previous&&now-previous.at<3000)throw Error('Wait 3 seconds between messages');const message={id:randomUUID(),owner:owner.toLowerCase(),text,at:now};s.messages=[...s.messages.filter(m=>now-m.at<86400000),message].slice(-100);return message;});
}
