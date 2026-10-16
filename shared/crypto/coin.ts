import {encodeAbiParameters,keccak256,type Hex,type Address} from 'viem';
export type TossCount=1|11|21;
export type CoinReceipt={id:Hex;commitment:Hex;seed:Hex;entropy:Hex;count:TossCount;choice:0|1;stake:string;payout:string;heads:number;push:boolean;transaction:Hex};
export type CoinRound={id:Hex;player:Address;commitment:Hex;stake:string;count:TossCount;choice:0|1;phase:number;deadline:string;heads:number;payout:string;failure:boolean;receipt?:CoinReceipt};
export const coinAbi=[
 {type:'function',name:'coinRulesVersion',stateMutability:'view',inputs:[],outputs:[{type:'uint8'}]},
 {type:'function',name:'offerCoin',stateMutability:'nonpayable',inputs:[{name:'id',type:'bytes32'},{name:'commitment',type:'bytes32'},{name:'player',type:'address'},{name:'stake',type:'uint128'},{name:'count',type:'uint8'}],outputs:[]},
 {type:'function',name:'joinCoin',stateMutability:'nonpayable',inputs:[{name:'id',type:'bytes32'},{name:'choice',type:'uint8'},{name:'playerEntropy',type:'bytes32'}],outputs:[]},
 {type:'function',name:'settleCoin',stateMutability:'nonpayable',inputs:[{name:'id',type:'bytes32'},{name:'seed',type:'bytes32'}],outputs:[]},
 {type:'function',name:'claimCoinFailure',stateMutability:'nonpayable',inputs:[{name:'id',type:'bytes32'}],outputs:[]},
 {type:'function',name:'coinState',stateMutability:'view',inputs:[{name:'id',type:'bytes32'}],outputs:[{type:'tuple',components:[{name:'player',type:'address'},{name:'commitment',type:'bytes32'},{name:'entropy',type:'bytes32'},{name:'stake',type:'uint128'},{name:'deadline',type:'uint64'},{name:'count',type:'uint8'},{name:'choice',type:'uint8'},{name:'phase',type:'uint8'},{name:'heads',type:'uint8'},{name:'payout',type:'uint128'},{name:'failure',type:'bool'}]}]},
 {type:'event',name:'CoinFinished',inputs:[{name:'id',type:'bytes32',indexed:true},{name:'seed',type:'bytes32',indexed:false},{name:'heads',type:'uint8',indexed:false},{name:'payout',type:'uint128',indexed:false},{name:'push',type:'bool',indexed:false},{name:'failure',type:'bool',indexed:false}]}
] as const;
export function tosses(seed:Hex,entropy:Hex,count:TossCount):('H'|'T')[]{return Array.from({length:count},(_,n)=>BigInt(keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'uint8'}],[seed,entropy,n])))%2n===0n?'H':'T');}
export function coinOdds(_count:TossCount){return{tie:0,win:0.5,lose:0.5};}
export function verifyCoinReceipt(r:CoinReceipt){
 if(![1,11,21].includes(r.count)||![0,1].includes(r.choice)||!/^\d+$/.test(r.stake)||!/^\d+$/.test(r.payout))throw Error('Invalid coin receipt');
 if(BigInt(r.stake)<1000000n||BigInt(r.stake)>5000000n||BigInt(r.stake)%10000n!==0n)throw Error('Invalid coin stake');
 if(keccak256(encodeAbiParameters([{type:'bytes32'}],[r.seed]))!==r.commitment)throw Error('Coin commitment mismatch');
 const flips=tosses(r.seed,r.entropy,r.count),heads=flips.filter(v=>v==='H').length,push=heads*2===r.count,win=r.choice===0?heads*2>r.count:heads*2<r.count;
 const paid=push?BigInt(r.stake):win?BigInt(r.stake)*2n:0n;
 if(heads!==r.heads||push!==r.push||paid!==BigInt(r.payout))throw Error('Coin payout mismatch');return flips;
}
