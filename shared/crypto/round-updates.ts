import type {HouseRound} from './house';
/** A late poll must never replace cards/actions already confirmed in a newer block. */
export function mergeRoundUpdate(current:HouseRound|undefined,incoming:HouseRound):HouseRound{
 if(!current)return incoming;
 if(incoming.unavailable)return current.id===incoming.id?{...current,unavailable:true}:current;
 if(current.observedBlock&&incoming.observedBlock){const before=BigInt(current.observedBlock),after=BigInt(incoming.observedBlock);if(after<before)return current;if(current.id===incoming.id&&after===before&&(incoming.actionCount??0)<(current.actionCount??0))return current;}
 if(current.id===incoming.id&&current.phase===5&&incoming.phase!==5)return current;
 return incoming;
}
