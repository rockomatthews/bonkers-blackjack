import {parseAbi} from 'viem';
export const tableAbi=parseAbi([
 'struct Offer {bytes32 tableId;uint64 nonce;uint64 validUntil;uint8[] seats;uint128[] stakes;bytes32[] commitments;bytes signature;}',
 'struct Proof {bytes32 seed;uint8[] moves;bytes32[] observations;bytes[] signatures;bytes[] acknowledgements;}',
 'function tableVersion() view returns(uint8)',
 'function ownerTable(address) view returns(bytes32)',
 'function tableState(bytes32) view returns(address owner,address key,uint64 opened,uint64 expires,uint64 nonce,uint64 closeAt,uint64 disputeAt,bytes32 disputedOffer,uint128 failureProfit,bool closed,bool answered,uint128 spent,uint128 payout,uint128 fee)',
 'function openTable(address key,uint128 amount,uint128 limit,uint64 expires) returns(bytes32)',
 'function settleTableRound(Offer offer,bytes32 entropy,bytes betSignature,Proof[] proofs)',
 'function closeTableCooperative(bytes32 id,uint64 nonce,bytes playerSignature,bytes dealerSignature)',
 'function requestTableClose(bytes32 id)',
 'function claimTableClose(bytes32 id)',
 'function disputeTableRound(Offer offer,bytes32 entropy,bytes betSignature)',
 'function answerTableDispute(Offer offer,bytes32 entropy,bytes betSignature,Proof[] proofs)',
 'function finalizeTableDispute(bytes32 id)',
 'event TableDisputed(bytes32 indexed id,uint64 nonce,uint64 deadline,bytes32 entropy,bytes betSignature)',
 'event TableSettled(bytes32 indexed id,uint64 indexed nonce,uint128 spent,uint128 payout,uint128 fee)',
]);
export const tableVaultAbi=parseAbi(['function tables(bytes32) view returns(address player,uint128 balance,uint128 collateral,uint128 limit,bool closed)']);
