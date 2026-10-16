// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {BlackjackReplay as R} from "../../src/crypto/BlackjackReplay.sol";
interface RulesVm {function expectRevert() external;}
contract ReplayHarness {
 function step(R.State memory s,uint16[312] memory cards,R.Action memory a) external pure {R.step(s,cards,a);}
 function legal(bytes memory data) external pure returns(uint8){return R.legalMoves(data);}
 function verify(bytes32 seed,bytes32 entropy,uint128[] memory stakes,R.Action[] memory actions,bytes32[] memory obs,uint128[] memory added) external pure returns(uint128[] memory){return R.verify(seed,entropy,stakes,actions,obs,added);}
}
contract BlackjackRulesTest {
 RulesVm constant vm=RulesVm(address(uint160(uint256(keccak256("hevm cheat code")))));
 ReplayHarness h=new ReplayHarness();
 function rig(uint16 first,uint16 up,uint16 second,uint16 hole) private pure returns(uint16[312] memory d){for(uint16 i=0;i<312;i++)d[i]=i;d[0]=first;d[1]=up;d[2]=second;d[3]=hole;}
 function stake() private pure returns(uint128[] memory a){a=new uint128[](1);a[0]=5e6;}
 function testInsuranceBeforePeekPaysGrossThreeTimesPremium() public {
  uint16[312] memory d=rig(9,0,8,12);R.State memory s=R.initial(d,1);
  require(s.insurance&&!s.done&&R.legalMoves(R.observation(s))==100);
  require(R.step(s,d,R.Action(0,5))==1);require(s.done&&!s.insurance&&s.seats[0].insured);
  require(R.payouts(s,stake())[0]==75e5);
  vm.expectRevert();h.step(s,d,R.Action(0,5));
 }
 function testInsuredNaturalEvenMoneyWithAndWithoutDealerBlackjack() public {
  for(uint16 hole=5;hole<=12;hole+=7){uint16[312] memory d=rig(0,13,9,hole);R.State memory s=R.initial(d,1);require(s.seats[0].hands[0].done&&s.insurance);R.step(s,d,R.Action(0,5));require(s.done);require(R.payouts(s,stake())[0]-75e5==5e6);}
 }
 function testInsuranceDeclinesAreFreeAndOnlyInsuranceActionsAllowed() public {
  uint16[312] memory d=rig(9,0,8,5);R.State memory s=R.initial(d,1);
  vm.expectRevert();h.step(s,d,R.Action(0,7));vm.expectRevert();h.step(s,d,R.Action(0,3));
  require(R.step(s,d,R.Action(0,2))==0);require(!s.insurance&&!s.seats[0].insured&&!s.done);
  vm.expectRevert();h.step(s,d,R.Action(0,5));R.step(s,d,R.Action(0,2));require(R.payouts(s,stake())[0]==10e6);
 }
 function testSurrenderReturnsHalfAndCannotFollowHitOrSplit() public {
  uint16[312] memory d=rig(9,8,5,6);R.State memory s=R.initial(d,1);uint16 cursor=s.cursor;
  require((R.legalMoves(R.observation(s))&128)!=0);require(R.step(s,d,R.Action(0,7))==0);
  require(s.done&&s.seats[0].hands[0].surrendered&&s.cursor==cursor);require(R.payouts(s,stake())[0]==25e5);
  d=rig(1,9,2,6);s=R.initial(d,1);R.step(s,d,R.Action(0,1));require((R.legalMoves(R.observation(s))&128)==0);vm.expectRevert();h.step(s,d,R.Action(0,7));
  d=rig(7,9,20,6);s=R.initial(d,1);R.step(s,d,R.Action(0,4));require((R.legalMoves(R.observation(s))&128)==0);vm.expectRevert();h.step(s,d,R.Action(0,7));
  d=rig(4,9,5,6);s=R.initial(d,1);R.step(s,d,R.Action(0,3));require(s.done);vm.expectRevert();h.step(s,d,R.Action(0,7));
 }
 function testInsuranceDecisionsIncludeAllSevenSeatsAndNaturals() public {
  uint16[312] memory d;for(uint16 i=0;i<312;i++)d[i]=9;d[7]=0;d[15]=12;d[0]=0;
  R.State memory s=R.initial(d,7);require(s.insurance&&s.seats[0].hands[0].done);
  for(uint8 i=0;i<7;i++){require(s.active==i);require(R.legalMoves(R.observation(s))==100);R.step(s,d,R.Action(i,i%2==0?5:6));if(i<6)require(!s.done&&s.insurance);}
  require(s.done&&!s.insurance);uint128[] memory stakes=new uint128[](7);for(uint8 i=0;i<7;i++)stakes[i]=5e6;
  uint128[] memory paid=R.payouts(s,stakes);require(paid[0]==125e5&&paid[1]==0&&paid[2]==75e5);
 }
 function testObservationHidesHoleAndBindsInsuranceAndSurrenderFlags() public {
  uint16[312] memory d=rig(9,0,8,5);R.State memory s=R.initial(d,1);bytes32 beforeHash=keccak256(R.observation(s));
  s.dealer[1]=12;require(keccak256(R.observation(s))==beforeHash);
  s.seats[0].insured=true;s.seats[0].insuranceDecided=true;require(keccak256(R.observation(s))!=beforeHash);
  bytes memory data=R.observation(R.initial(d,1));data[5]=0x02;vm.expectRevert();h.legal(data);
  data=R.observation(R.initial(d,1));data[0]=0x01;vm.expectRevert();h.legal(data);
  data=bytes.concat(R.observation(R.initial(d,1)),hex"00");vm.expectRevert();h.legal(data);
 }
 function testFuzzTranscriptInsuranceSurrenderAndAddedStake(uint128 raw) public {
  bytes32 seed=bytes32(uint256(raw));bytes32 entropy=keccak256("rules differential");uint16[312] memory d=R.deck(seed,entropy);R.State memory s=R.initial(d,1);
  R.Action[] memory actions=new R.Action[](0);bytes32[] memory obs=new bytes32[](1);obs[0]=keccak256(R.observation(s));uint128[] memory added=new uint128[](1);
  // At most insurance then surrender; natural/dealer blackjack may settle sooner.
  if(s.insurance){actions=new R.Action[](1);actions[0]=R.Action(0,5);added[0]=25e5;R.step(s,d,actions[0]);obs=new bytes32[](2);obs[0]=keccak256(R.observation(R.initial(d,1)));obs[1]=keccak256(R.observation(s));}
  if(!s.done){uint256 n=actions.length;R.Action[] memory expanded=new R.Action[](n+1);bytes32[] memory snapshots=new bytes32[](n+2);for(uint256 i=0;i<n;i++)expanded[i]=actions[i];for(uint256 i=0;i<=n;i++)snapshots[i]=obs[i];expanded[n]=R.Action(0,7);R.step(s,d,expanded[n]);snapshots[n+1]=keccak256(R.observation(s));actions=expanded;obs=snapshots;}
  require(s.done);uint128[] memory result=h.verify(seed,entropy,stake(),actions,obs,added);require(result[0]==R.payouts(s,stake())[0]);
  added[0]++;vm.expectRevert();h.verify(seed,entropy,stake(),actions,obs,added);
 }
 function testInsuredFourDoubledSplitHandsStayWithinSixteenTimesPayout() public {
  uint16[312] memory d=rig(7,0,20,5);for(uint8 i=4;i<10;i++)d[i]=7;for(uint8 i=10;i<14;i++)d[i]=4;
  R.State memory s=R.initial(d,1);uint256 halfUnits=R.step(s,d,R.Action(0,5));
  for(uint8 i=0;i<3;i++)halfUnits+=R.step(s,d,R.Action(0,4));
  require(s.seats[0].count==4);for(uint8 i=0;i<4;i++)halfUnits+=R.step(s,d,R.Action(0,3));
  require(halfUnits==15&&s.done&&s.seats[0].insured);require(R.payouts(s,stake())[0]==80e6);
 }

}
