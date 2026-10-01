// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {BlackjackGame} from "../../src/crypto/BlackjackGame.sol";
import {BlackjackReplay as R} from "../../src/crypto/BlackjackReplay.sol";
import {PlayerVault} from "../../src/crypto/PlayerVault.sol";
import {VaultToken,VaultVm} from "./PlayerVault.t.sol";
interface GameVm is VaultVm {function warp(uint256) external;function chainId(uint256) external;}
contract BlackjackGameTest {
 GameVm constant vm=GameVm(address(uint160(uint256(keccak256("hevm cheat code")))));
 VaultToken token;BlackjackGame game;PlayerVault vault;bytes32 constant ID=keccak256("round");address alice=address(0x123);
 function setUp() public {token=new VaultToken();game=new BlackjackGame(token,address(this),address(this));vault=game.vault();vault.setPaused(false);token.mint(address(this),100000e6);token.approve(address(vault),type(uint256).max);vault.fundHouse(100000e6);token.mint(alice,1000e6);vm.prank(alice);token.approve(address(vault),type(uint256).max);vault.depositFor(alice,1000e6);}
 function start(bytes32 seed) internal returns(R.State memory s,uint16[312] memory cards){game.offer(ID,keccak256(abi.encode(seed)));vm.prank(alice);game.join(ID,5e6,keccak256("player entropy"));game.start(ID);(,,,bytes32 entropy,,,,)=game.state(ID);cards=R.deck(seed,entropy);s=R.initial(cards,1);}
 function testFuzzReplayAndSolvency(uint128 raw) public {
  bytes32 seed=bytes32(uint256(raw));(R.State memory s,uint16[312] memory cards)=start(seed);
  uint256 n;while(!s.done){bytes memory data=R.observation(s);game.observe(ID,data);uint8 mask=R.legalMoves(data);uint8 move=2;if(n%3==0&&(mask&8)!=0)move=3;else if(n%5==0&&(mask&16)!=0)move=4;else if(R.total(s.seats[0].hands[s.seats[0].active].cards,s.seats[0].hands[s.seats[0].active].count)<17)move=1;
   vm.prank(alice);game.act(ID,move,move>=3?uint128(5e6):0,keccak256(data));R.step(s,cards,R.Action(0,move));n++;
  }
  game.observe(ID,R.observation(s));game.settle(ID,seed);require(vault.reserved()==0&&vault.playerLocked()==0);require(token.balanceOf(address(vault))==vault.accountedAssets());vm.expectRevert();game.settle(ID,seed);
 }
 function testWithheldResultReturnsMaximumAndFee() public {start(bytes32(uint256(8)));vm.warp(block.timestamp+60);game.claimFailure(ID);require(vault.available(alice)==1075e6);require(vault.feeRevenue()==0);}
 function testAutomaticStandCannotBecomeOperatorFault() public {
  (R.State memory s,)=start(bytes32(uint256(7)));if(s.done)return;game.observe(ID,R.observation(s));vm.warp(block.timestamp+30);vm.expectRevert();game.claimFailure(ID);game.autoStand(ID);vm.warp(block.timestamp+60);game.claimFailure(ID);require(vault.available(alice)==1075e6);
 }
 function testWrongRevealAndManipulatedObservationRejected() public {
  bytes32 seed=bytes32(uint256(9));(R.State memory s,uint16[312] memory cards)=start(seed);while(!s.done){bytes memory data=R.observation(s);game.observe(ID,data);vm.prank(alice);game.act(ID,2,0,keccak256(data));R.step(s,cards,R.Action(0,2));}
  s.dealer[0]=(s.dealer[0]+1)%312;game.observe(ID,R.observation(s));vm.expectRevert();game.settle(ID,seed);vm.warp(block.timestamp+60);game.claimFailure(ID);
 }
 function testSevenPlayersReplay() public {
  bytes32 seed=bytes32(uint256(32));game.offer(ID,keccak256(abi.encode(seed)));
  for(uint256 i=1;i<=7;i++){address player=address(uint160(i+100));token.mint(player,100e6);vm.prank(player);token.approve(address(vault),100e6);vault.depositFor(player,100e6);vm.prank(player);game.join(ID,5e6,bytes32(i));}
  game.start(ID);(,,,bytes32 entropy,address[] memory players,,,)=game.state(ID);uint16[312] memory cards=R.deck(seed,entropy);R.State memory s=R.initial(cards,7);
  while(!s.done){bytes memory data=R.observation(s);game.observe(ID,data);vm.prank(players[s.active]);game.act(ID,2,0,keccak256(data));R.step(s,cards,R.Action(s.active,2));}
  game.observe(ID,R.observation(s));game.settle(ID,seed);require(vault.reserved()==0);require(token.balanceOf(address(vault))==vault.accountedAssets());
 }
 function testIllegalSplitAndStaleObservationRejected() public {
  (R.State memory s,)=start(bytes32(uint256(7)));if(s.done)return;bytes memory data=R.observation(s);game.observe(ID,data);
  vm.expectRevert();vm.prank(alice);game.act(ID,2,0,bytes32(0));
  if((R.legalMoves(data)&16)==0){vm.expectRevert();vm.prank(alice);game.act(ID,4,5e6,keccak256(data));}
 }
 function testMainnetAcceptsOtherWalletsButProtectsHouse() public {
  vm.chainId(8453);BlackjackGame pilot=new BlackjackGame(token,address(this),address(this));PlayerVault v=pilot.vault();v.setPaused(false);
  token.mint(address(this),1100e6);token.approve(address(v),1100e6);v.fundHouse(1000e6);v.depositFor(address(this),100e6);
  pilot.offer(ID,keccak256(abi.encode(bytes32(uint256(1)))));
  token.mint(alice,10e6);vm.prank(alice);token.approve(address(v),10e6);v.depositFor(alice,10e6);
  vm.prank(alice);pilot.join(ID,5e6,bytes32(0));
  vm.expectRevert();vm.prank(alice);v.withdrawProfit(1);
  vm.expectRevert();pilot.join(ID,6e6,bytes32(0));
  pilot.join(ID,5e6,bytes32(0));require(v.playerLocked()==10e6);
 }

}
