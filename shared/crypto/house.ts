import type {Address,Hex} from 'viem';
import type {CryptoState} from './replay';
import type {LabReceipt} from '../../server/crypto/lab-types';
export const HOUSE_ADDRESS='0xe8e3587b47253051Aed6e02430cdE5B1c1664B6B' as Address;
export const HOUSE_RESERVE=75000000n;
export const INITIAL_WAGER=5000000n;
export type HouseDeployment={game:Address;vault:Address;block:string;transaction:Hex};
export type HouseStatus={house:Address;dealer?:Address;deployment?:HouseDeployment;depositsOpen:boolean;dealerReady:boolean;reason:string;houseBalance?:string;reserved?:string;dealerGas?:string};
export type HouseRound={id:Hex;commitment:Hex;phase:number;deadline:string;players:Address[];stakes:string[];observation?:Hex;state?:CryptoState;receipt?:LabReceipt;failure?:boolean};
export function walletLoginMessage(origin:string,address:Address,nonce:string){return `Bonkers Blackjack wallet sign-in\nSite: ${origin}\nWallet: ${address.toLowerCase()}\nNetwork: Base (8453)\nNonce: ${nonce}\nThis signature connects your wallet. It does not authorize transactions.`;}
