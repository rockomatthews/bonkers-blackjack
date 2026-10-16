// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {BlackjackGameTest} from "./BlackjackGame.t.sol";
import {BlackjackGame} from "../../src/crypto/BlackjackGame.sol";
contract CoinGameTest is BlackjackGameTest {
 bytes32 constant COIN=keccak256("coin one");
 function coin(uint8 count,uint8 choice,bytes32 seed) internal returns(uint128 paid){
  uint256 beforeBalance=vault.available(alice);uint256 beforeHouse=vault.house();
  game.offerCoin(COIN,keccak256(abi.encode(seed)),alice,5e6,count);
  vm.prank(alice);game.joinCoin(COIN,choice,keccak256("player randomness"));
  require(vault.reserved()==5010000&&vault.playerLocked()==5e6,"coin reserve");
  game.settleCoin(COIN,seed);BlackjackGame.CoinRound memory r=game.coinState(COIN);paid=r.payout;
  require(r.phase==3&&!r.failure&&r.heads<=count);require(r.heads*2!=count,"odd batch tied");
  require(paid==0||paid==10e6);require(vault.available(alice)==beforeBalance-5010000+paid);require(vault.house()==beforeHouse+5010000-paid);
  require(vault.reserved()==0&&vault.playerLocked()==0);require(vault.accountedAssets()==token.balanceOf(address(vault)));
 }
 function testFuzzSingleCoinConservesFunds(bytes32 seed,bool tails) public {coin(1,tails?1:0,seed);}
 function testFuzzElevenCoinConservesFunds(bytes32 seed,bool tails) public {coin(11,tails?1:0,seed);}
 function testFuzzTwentyOneCoinConservesFunds(bytes32 seed,bool tails) public {coin(21,tails?1:0,seed);}
 function testCoinWrongPlayerSeedReplayAndEvenBatchesRejected() public {
  bytes32 seed=bytes32(uint256(8));
  vm.expectRevert();game.offerCoin(COIN,keccak256(abi.encode(seed)),alice,5e6,10);
  vm.expectRevert();game.offerCoin(COIN,keccak256(abi.encode(seed)),alice,5e6,20);
  game.offerCoin(COIN,keccak256(abi.encode(seed)),alice,5e6,11);
  vm.expectRevert();game.joinCoin(COIN,0,bytes32(0));
  vm.prank(alice);game.joinCoin(COIN,0,bytes32(0));
  vm.expectRevert();game.settleCoin(COIN,bytes32(uint256(9)));
  game.settleCoin(COIN,seed);vm.expectRevert();game.settleCoin(COIN,seed);
 }
 function testWithheldCoinMaximumRecoveryRefundsFeeAndAllowsPausedWithdrawal() public {
  game.offerCoin(COIN,keccak256(abi.encode(bytes32(uint256(1)))),alice,5e6,21);vm.prank(alice);game.joinCoin(COIN,1,bytes32(0));
  vm.warp(block.timestamp+60);game.claimCoinFailure(COIN);require(vault.available(alice)==1005e6&&vault.feeRevenue()==0&&vault.house()==99995e6);vault.setPaused(true);vm.prank(alice);vault.withdraw(1005e6,alice);require(vault.accountedAssets()==token.balanceOf(address(vault)));
 }
 function testBlackjackAndCoinCannotDoubleSpendHouseReserve() public {
  vault.withdrawProfit(vault.house()-75e6);game.offerFor(ID,keccak256(abi.encode(bytes32(uint256(3)))),alice);vm.prank(alice);game.join(ID,5e6,bytes32(0));
  game.offerCoin(COIN,keccak256(abi.encode(bytes32(uint256(1)))),alice,5e6,1);vm.expectRevert();vm.prank(alice);game.joinCoin(COIN,0,bytes32(0));require(vault.house()==vault.reserved());
 }
 function testCoinReserveCanBlockAConcurrentBlackjackHand() public {
  vault.withdrawProfit(vault.house()-75e6);game.offerCoin(COIN,keccak256(abi.encode(bytes32(uint256(1)))),alice,5e6,1);vm.prank(alice);game.joinCoin(COIN,0,bytes32(0));game.offerFor(ID,keccak256(abi.encode(bytes32(uint256(3)))),alice);vm.expectRevert();vm.prank(alice);game.join(ID,5e6,bytes32(0));require(vault.reserved()==5010000);
 }
}
