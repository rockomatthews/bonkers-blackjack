export const CHAT_ROOMS=['general','blackjack','toin-coss'] as const;
export type ChatRoom=typeof CHAT_ROOMS[number];
export type ChatMessage={id:string;owner:string;text:string;at:number};
export function chatRoom(path:string):ChatRoom{return path.startsWith('/toin-coss')?'toin-coss':path==='/blackjack'||path==='/practice'||path.startsWith('/live/')?'blackjack':'general';}
export function chatText(value:unknown){if(typeof value!=='string')throw Error('Enter a message');const text=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,' ').trim();if(!text||text.length>500)throw Error('Messages must contain 1–500 characters');return text;}
