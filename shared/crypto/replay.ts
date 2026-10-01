import {encodeAbiParameters,keccak256,toHex,type Hex} from 'viem';
export type CryptoHand={cards:number[];multiplier:number;split:boolean;splitAce:boolean;done:boolean};
export type CryptoState={seats:{hands:CryptoHand[];active:number}[];dealer:number[];active:number;cursor:number;done:boolean};
export type CryptoAction={seat:number;move:number};
export const rank=(card:number)=>card%13+1;
export function total(cards:number[]){let value=0,aces=0;for(const c of cards){const r=rank(c);if(r===1){value+=11;aces++;}else value+=Math.min(r,10);}while(value>21&&aces){value-=10;aces--;}return value;}
export function shuffle(seed:Hex,entropy:Hex){const deck=Array.from({length:312},(_,i)=>i);for(let i=311;i>0;i--){const hash=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'uint256'}],[seed,entropy,BigInt(i)]));const j=Number(BigInt(hash)%BigInt(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
const hand=(cards:number[]):CryptoHand=>({cards,multiplier:1,split:false,splitAce:false,done:false});
function next(s:CryptoState,deck:number[]){while(s.active<s.seats.length){const p=s.seats[s.active];while(p.active<p.hands.length&&p.hands[p.active].done)p.active++;if(p.active<p.hands.length)return;s.active++;}while(total(s.dealer)<17)s.dealer.push(deck[s.cursor++]);s.done=true;}
export function initial(deck:number[],players:number):CryptoState {
 if(players<1||players>7)throw Error('Players');
 const s:CryptoState={seats:Array.from({length:players},()=>({hands:[hand([])],active:0})),dealer:[],active:0,cursor:0,done:false};
 for(const p of s.seats)p.hands[0].cards.push(deck[s.cursor++]);s.dealer.push(deck[s.cursor++]);for(const p of s.seats)p.hands[0].cards.push(deck[s.cursor++]);s.dealer.push(deck[s.cursor++]);
 if(total(s.dealer)===21){s.done=true;s.active=players;return s;}
 for(const p of s.seats)if(total(p.hands[0].cards)===21)p.hands[0].done=true;next(s,deck);return s;
}
export function legalMoves(s:CryptoState){if(s.done)return [];const p=s.seats[s.active],h=p.hands[p.active];const moves=[2];if(!h.splitAce){moves.push(1);if(h.cards.length===2&&h.multiplier===1){moves.push(3);if(p.hands.length<4&&rank(h.cards[0])===rank(h.cards[1]))moves.push(4);}}return moves;}
export function step(s:CryptoState,deck:number[],a:CryptoAction){
 if(s.done||a.seat!==s.active||!legalMoves(s).includes(a.move))throw Error('Illegal action');
 const p=s.seats[s.active],h=p.hands[p.active];let extra=0;
 if(a.move===1){h.cards.push(deck[s.cursor++]);if(total(h.cards)>=21)h.done=true;}
 if(a.move===2)h.done=true;
 if(a.move===3){extra=h.multiplier;h.multiplier*=2;h.cards.push(deck[s.cursor++]);h.done=true;}
 if(a.move===4){extra=h.multiplier;const sibling=hand([h.cards.pop()!]);sibling.multiplier=h.multiplier;sibling.split=h.split=true;sibling.splitAce=h.splitAce=rank(h.cards[0])===1;h.cards.push(deck[s.cursor++]);sibling.cards.push(deck[s.cursor++]);h.done=h.splitAce||total(h.cards)===21;sibling.done=sibling.splitAce||total(sibling.cards)===21;p.hands.splice(p.active+1,0,sibling);}
 next(s,deck);return extra;
}
export function observation(s:CryptoState):Hex{
 const out=[1,Number(s.done),s.active,s.seats.length,s.done?s.dealer.length:1];const card=(c:number)=>out.push(c>>8,c&255);
 for(const c of (s.done?s.dealer:s.dealer.slice(0,1)))card(c);
 for(const p of s.seats){out.push(p.hands.length,p.active);for(const h of p.hands){out.push(h.cards.length,h.multiplier,Number(h.split),Number(h.splitAce),Number(h.done));for(const c of h.cards)card(c);}}
 return toHex(Uint8Array.from(out));
}
export function payouts(s:CryptoState,stakes:readonly bigint[]){
 if(!s.done)throw Error('Unfinished round');const d=total(s.dealer),bj=d===21&&s.dealer.length===2;
 return s.seats.map((p,i)=>p.hands.reduce((sum,h)=>{const v=total(h.cards),stake=stakes[i]*BigInt(h.multiplier),natural=!h.split&&h.cards.length===2&&v===21;if(v>21)return sum;if(bj)return sum+(natural?stake:0n);if(natural)return sum+stake*5n/2n;return sum+(d>21||v>d?stake*2n:v===d?stake:0n);},0n));
}
export function publicState(s:CryptoState){return {...s,dealer:s.done?s.dealer:s.dealer.slice(0,1)};}
