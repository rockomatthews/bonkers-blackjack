import {encodeAbiParameters,keccak256,toHex,type Hex} from 'viem';
export const RULES_VERSION=2;
export type CryptoHand={cards:number[];multiplier:number;split:boolean;splitAce:boolean;done:boolean;surrendered?:boolean};
export type CryptoState={seats:{hands:CryptoHand[];active:number;insured?:boolean;insuranceDecided?:boolean}[];dealer:number[];active:number;cursor:number;done:boolean;insurance?:boolean};
export type CryptoAction={seat:number;move:number};
export const rank=(card:number)=>card%13+1;
export function total(cards:number[]){let value=0,aces=0;for(const c of cards){const r=rank(c);if(r===1){value+=11;aces++;}else value+=Math.min(r,10);}while(value>21&&aces){value-=10;aces--;}return value;}
export function shuffle(seed:Hex,entropy:Hex){const deck=Array.from({length:312},(_,i)=>i);for(let i=311;i>0;i--){const hash=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'uint256'}],[seed,entropy,BigInt(i)]));const j=Number(BigInt(hash)%BigInt(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
const hand=(cards:number[]):CryptoHand=>({cards,multiplier:1,split:false,splitAce:false,done:false,surrendered:false});
function draw(s:CryptoState,deck:number[]){const c=deck[s.cursor++];if(c===undefined||c<0||c>=312)throw Error('Deck bound');return c;}
function next(s:CryptoState,deck:number[]){
 while(s.active<s.seats.length){const p=s.seats[s.active];while(p.active<p.hands.length&&p.hands[p.active].done)p.active++;if(p.active<p.hands.length)return;s.active++;}
 const needDealer=s.seats.some(p=>p.hands.some(h=>!h.surrendered&&total(h.cards)<=21&&(h.split||h.cards.length!==2||total(h.cards)!==21)));
 if(needDealer)while(total(s.dealer)<17)s.dealer.push(draw(s,deck));s.done=true;
}
export function initial(deck:number[],players:number):CryptoState {
 if(!Number.isInteger(players)||players<1||players>7)throw Error('Players');
 const s:CryptoState={seats:Array.from({length:players},()=>({hands:[hand([])],active:0,insured:false,insuranceDecided:false})),dealer:[],active:0,cursor:0,done:false,insurance:false};
 for(const p of s.seats)p.hands[0].cards.push(draw(s,deck));s.dealer.push(draw(s,deck));for(const p of s.seats)p.hands[0].cards.push(draw(s,deck));s.dealer.push(draw(s,deck));
 for(const p of s.seats)if(total(p.hands[0].cards)===21)p.hands[0].done=true;
 if(rank(s.dealer[0])===1){s.insurance=true;return s;}
 if(total(s.dealer)===21){s.done=true;s.active=players;return s;}
 next(s,deck);return s;
}
export function legalMoves(s:CryptoState){
 if(s.done)return [];
 if(s.insurance)return [2,5,6];
 const p=s.seats[s.active],h=p.hands[p.active];if(h.done)return [];
 const moves=[2];if(!h.splitAce){moves.push(1);if(h.cards.length===2&&h.multiplier===1){moves.push(3);if(p.hands.length<4&&rank(h.cards[0])===rank(h.cards[1]))moves.push(4);if(!h.split)moves.push(7);}}return moves;
}
/** Exact USDC extra stake, shared by wallet actions and transcript accounting. */
export function extraStake(move:number,stake:bigint){return move===3||move===4?stake:move===5?stake/2n:0n;}
/** Returns added stake in HALF-initial-wager units. */
export function step(s:CryptoState,deck:number[],a:CryptoAction){
 if(s.done||a.seat!==s.active||!legalMoves(s).includes(a.move))throw Error('Illegal action');
 const p=s.seats[s.active];
 if(s.insurance){
  if(p.insuranceDecided)throw Error('Insurance already decided');
  p.insured=a.move===5;p.insuranceDecided=true;s.active++;
  if(s.active===s.seats.length){s.insurance=false;s.active=0;if(total(s.dealer)===21){s.done=true;s.active=s.seats.length;}else next(s,deck);}
  return p.insured?1:0;
 }
 const h=p.hands[p.active];let extra=0;
 if(a.move===1){h.cards.push(draw(s,deck));if(total(h.cards)>=21)h.done=true;}
 if(a.move===2)h.done=true;
 if(a.move===3){extra=2;h.multiplier=2;h.cards.push(draw(s,deck));h.done=true;}
 if(a.move===4){extra=2;const sibling=hand([h.cards.pop()!]);sibling.multiplier=h.multiplier;sibling.split=h.split=true;sibling.splitAce=h.splitAce=rank(h.cards[0])===1;h.cards.push(draw(s,deck));sibling.cards.push(draw(s,deck));h.done=h.splitAce||total(h.cards)===21;sibling.done=sibling.splitAce||total(sibling.cards)===21;p.hands.splice(p.active+1,0,sibling);}
 if(a.move===7){h.surrendered=true;h.done=true;}
 next(s,deck);return extra;
}
export function observation(s:CryptoState):Hex{
 const out=[2,Number(s.done),s.active,s.seats.length,s.done?s.dealer.length:1,Number(!!s.insurance)];const card=(c:number)=>out.push(c>>8,c&255);
 for(const c of (s.done?s.dealer:s.dealer.slice(0,1)))card(c);
 for(const p of s.seats){out.push(p.hands.length,p.active,Number(!!p.insured),Number(!!p.insuranceDecided));for(const h of p.hands){out.push(h.cards.length,h.multiplier,Number(h.split),Number(h.splitAce),Number(h.done),Number(!!h.surrendered));for(const c of h.cards)card(c);}}
 return toHex(Uint8Array.from(out));
}
export function payouts(s:CryptoState,stakes:readonly bigint[]){
 if(!s.done||stakes.length!==s.seats.length)throw Error('Unfinished round');const d=total(s.dealer),bj=d===21&&s.dealer.length===2;
 return s.seats.map((p,i)=>p.hands.reduce((sum,h)=>{const v=total(h.cards),stake=stakes[i]*BigInt(h.multiplier),natural=!h.split&&h.cards.length===2&&v===21;if(v>21)return sum;if(bj)return sum+(natural?stake:0n);if(h.surrendered)return sum+stake/2n;if(natural)return sum+stake*5n/2n;return sum+(d>21||v>d?stake*2n:v===d?stake:0n);},bj&&p.insured?stakes[i]*3n/2n:0n));
}
export function publicState(s:CryptoState){return {...s,dealer:s.done?s.dealer:s.dealer.slice(0,1)};}
