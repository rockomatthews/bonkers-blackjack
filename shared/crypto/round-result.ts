import type {HouseRound} from './house';
import {formatUSDC,wagerFee} from './money';
const money=(value:bigint)=>formatUSDC(value).replace(/(\.\d{2})0+$/,'$1');
export function roundResult(round:HouseRound):string|undefined{
 if(round.phase!==5||!round.players.length)return;
 const stake=BigInt(round.stakes[0]??round.wager??'0');
 if(round.failure)return `Dealer timeout · ${money(stake*16n)} USDC credited, fee refunded`;
 const player=round.state?.seats[0],gross=round.receipt?.payouts[0];if(!player||gross===undefined)return;
 const wagered=player.hands.reduce((sum,hand)=>sum+stake*BigInt(hand.multiplier),0n)+(player.insured?stake/2n:0n),paid=BigInt(gross),net=paid-wagered-wagerFee(stake);
 if(player.hands.every(hand=>hand.surrendered))return `Surrender · ${money(paid)} USDC returned`;
 if(paid===wagered)return `Push · ${money(paid)} USDC returned`;
 return paid>wagered?`You won · +${money(net)} USDC net`:`House won · −${money(-net)} USDC net`;
}
