import {parseAbi} from 'viem';
export const EVMNET={genesis:1727521075,period:3,hash:'04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3',key:'07e1d1d335df83fa98462005690372c643340060d205306a9aa8106b6bd0b3820557ec32c2ad488e4d4f6008f89a346f18492092ccc0d594610de2732c8b808f0095685ae3a85ba243747b1b2f426049010f6b73a0cf1d389351d5aaaa1047f6297d3a4f9749b33eb2d904c9d9ebf17224150ddd7abd7567a9bec6c74480ee0b'};
export function minuteTerms(now:number){const minute=Math.floor(now/60000),closesAt=(minute*60+50)*1000,flipsAt=(minute+1)*60000;return{minute,closesAt,flipsAt,locked:now>=closesAt};}
export function beaconForMinute(minute:number){return Math.ceil(((minute+1)*60-EVMNET.genesis)/3)+1;}
export type PublicFlip={minute:number;at:number;beacon:number;face:'heads'|'tails';signature:string;randomness:string};
export const globalCoinAbi=parseAbi([
 'function version() pure returns(uint8)','function vault() view returns(address)','function oracle() view returns(address)','function firstMinute() view returns(uint64)','function results(uint64) view returns(uint8)','function betCount() view returns(uint256)','function betIds(uint256) view returns(bytes32)','function ownerBetCount(address) view returns(uint256)','function ownerBetId(address,uint256) view returns(bytes32)',
 'function bets(bytes32) view returns(address owner,uint64 start,uint8 count,uint8 choice,uint128 stake,uint128 payout,bool closed,bool refunded)',
 'function recentBets(address) view returns(bytes32[] ids,(address owner,uint64 start,uint8 count,uint8 choice,uint128 stake,uint128 payout,bool closed,bool refunded)[] items)',
 'function readBets(bytes32[]) view returns((address owner,uint64 start,uint8 count,uint8 choice,uint128 stake,uint128 payout,bool closed,bool refunded)[])', 'function readResults(uint64[]) view returns(uint8[])',
 'function placeBet(uint64,uint8,uint8,uint128) returns(bytes32)','function resolve(uint64[],bytes[],bytes32[])','function settle(bytes32)','function refundMissing(bytes32)',
 'event BetPlaced(bytes32 indexed id,address indexed owner,uint64 start,uint8 count,uint8 choice,uint128 stake)',
]);
