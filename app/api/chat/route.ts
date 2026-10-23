import {readChat,postChat,validRoom} from '../../../server/chat';
import {housePostOrigin} from '../../../server/crypto/origin';
import {requestOwner} from '../../../server/crypto/request-owner';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request){try{return Response.json({messages:await readChat(validRoom(new URL(request.url).searchParams.get('room')))},{headers});}catch{return Response.json({error:'Chat is temporarily unavailable'},{status:503,headers});}}
export async function POST(request:Request){const origin=housePostOrigin(request);if(!origin)return Response.json({error:'Same-origin request required'},{status:403,headers});try{const owner=await requestOwner(origin,request),text=await request.text();if(text.length>3000)throw Error('Message too long');const body=JSON.parse(text);return Response.json({message:await postChat(validRoom(body.room),owner,body.text)},{headers});}catch(e){const message=e instanceof Error?e.message:'';return Response.json({error:/^(Wait 3|Messages must|Enter a message|Unknown chat|Reconnect)/.test(message)?message:'Chat could not send this message'},{status:message.startsWith('Reconnect')?401:message.startsWith('Wait 3')?429:400,headers});}}
