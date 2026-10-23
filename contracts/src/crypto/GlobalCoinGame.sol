// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {PlayerVault,IERC20} from "./PlayerVault.sol";
import {BLS} from "../vendor/drand/BLS.sol";
import {EvmnetRegistry} from "../vendor/drand/EvmnetRegistry.sol";
/// @notice One immutable public minute sequence. Future drand signatures are verified on-chain.
contract GlobalCoinGame {
 PlayerVault public immutable vault;
 EvmnetRegistry public immutable oracle;
 uint64 public immutable firstMinute;
 uint64 public constant GENESIS=1727521075;
 uint256 public constant RECOVERY_DELAY=1 days;
 uint256 public pending;
 struct Bet {address owner;uint64 start;uint8 count;uint8 choice;uint128 stake;uint128 payout;bool closed;bool refunded;}
 mapping(bytes32=>Bet) public bets;
 mapping(address=>uint256) public nonces;
 mapping(address=>bytes32[]) private owned;
 bytes32[] public betIds;
 mapping(uint64=>uint8) public results; // 0 pending, 1 heads, 2 tails
 event BetPlaced(bytes32 indexed id,address indexed owner,uint64 start,uint8 count,uint8 choice,uint128 stake);
 event FlipPublished(uint64 indexed minute,uint64 beacon,uint8 result,bytes signature);
 event BetSettled(bytes32 indexed id,uint128 payout,bool refunded);
 constructor(IERC20 token,address treasury){vault=new PlayerVault(token,address(this),treasury);oracle=new EvmnetRegistry();firstMinute=uint64(block.timestamp/60);}
 function version() external pure returns(uint8){return 1;}
 function beaconRound(uint64 minute) public pure returns(uint64){uint64 due=(minute+1)*60;require(due>=GENESIS,"minute before genesis");return (due-GENESIS+2)/3+1;}
 function betCount() external view returns(uint256){return betIds.length;}
 function ownerBetCount(address owner) external view returns(uint256){return owned[owner].length;}
 function ownerBetId(address owner,uint256 index) external view returns(bytes32){return owned[owner][index];}
 function recentBets(address owner) external view returns(bytes32[] memory ids,Bet[] memory out){uint256 total=owned[owner].length;uint256 n=total<20?total:20;ids=new bytes32[](n);out=new Bet[](n);for(uint256 i;i<n;i++){ids[i]=owned[owner][total-i-1];out[i]=bets[ids[i]];}}
 function readBets(bytes32[] calldata ids) external view returns(Bet[] memory out){require(ids.length<=1000,"read bound");out=new Bet[](ids.length);for(uint256 i;i<ids.length;i++)out[i]=bets[ids[i]];}
 function readResults(uint64[] calldata epochs) external view returns(uint8[] memory out){require(epochs.length<=4200,"read bound");out=new uint8[](epochs.length);for(uint256 i;i<epochs.length;i++)out[i]=results[epochs[i]];}
 function placeBet(uint64 minute,uint8 count,uint8 choice,uint128 stake) external returns(bytes32 id){
  require(minute==block.timestamp/60&&block.timestamp<minute*60+50,"betting locked");
  require((count==1||count==11||count==21)&&choice<2,"invalid bet");require(pending<200,"coin capacity full");
  id=keccak256(abi.encode(address(this),block.chainid,msg.sender,nonces[msg.sender]++));
  bets[id]=Bet(msg.sender,minute,count,choice,stake,0,false,false);betIds.push(id);owned[msg.sender].push(id);pending++;
  vault.lockCoin(id,msg.sender,stake);emit BetPlaced(id,msg.sender,minute,count,choice,stake);
 }
 function publishFlip(uint64 minute,bytes calldata signature) public {
  require(minute>=firstMinute&&block.timestamp>=(minute+1)*60,"flip not due");require(results[minute]==0,"flip already published");
  uint64 round=beaconRound(minute);require(BLS.isValidPointG1(BLS.g1Unmarshal(signature)),"invalid signature point");oracle.proveRound(signature,round);bytes32 randomness=oracle.roundRandomness(round);
  results[minute]=uint8(uint256(randomness)%2)+1;emit FlipPublished(minute,round,results[minute],signature);
 }
 function settle(bytes32 id) public {
  Bet storage b=bets[id];require(b.owner!=address(0)&&!b.closed,"unknown or closed bet");uint256 heads;
  for(uint64 i;i<b.count;i++){uint8 outcome=results[b.start+i];require(outcome!=0,"flips pending");if(outcome==1)heads++;}
  uint128 payout=((b.choice==0&&heads*2>b.count)||(b.choice==1&&heads*2<b.count))?b.stake*2:0;
  b.closed=true;b.payout=payout;pending--;vault.settleCoin(id,payout,false);emit BetSettled(id,payout,false);
 }
 function resolve(uint64[] calldata epochs,bytes[] calldata signatures,bytes32[] calldata ids) external {
  require(epochs.length==signatures.length&&epochs.length<=4&&ids.length<=100,"batch bound");
  for(uint256 i;i<epochs.length;i++)if(results[epochs[i]]==0)publishFlip(epochs[i],signatures[i]);
  for(uint256 i;i<ids.length;i++)if(!bets[ids[i]].closed)settle(ids[i]);
 }
 function refundMissing(bytes32 id) external {
  Bet storage b=bets[id];require(b.owner!=address(0)&&!b.closed,"unknown or closed bet");require(block.timestamp>=(b.start+b.count)*60+RECOVERY_DELAY,"recovery not due");
  bool missing;for(uint64 i;i<b.count;i++)if(results[b.start+i]==0)missing=true;require(missing,"settle completed sequence");
  b.closed=true;b.refunded=true;b.payout=b.stake;pending--;vault.settleCoin(id,b.stake,true);emit BetSettled(id,b.stake,true);
 }
}
