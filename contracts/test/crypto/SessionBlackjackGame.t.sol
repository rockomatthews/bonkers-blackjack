// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {SessionBlackjackGame,TableTypes,TableVerifier,PlayerVault} from "../../src/crypto/SessionBlackjackGame.sol";
import {BlackjackReplay as R} from "../../src/crypto/BlackjackReplay.sol";
import {VaultToken} from "./PlayerVault.t.sol";
interface TableVm {function addr(uint256) external returns(address);function sign(uint256,bytes32) external returns(uint8,bytes32,bytes32);function prank(address) external;function warp(uint256) external;function chainId(uint256) external;function expectRevert() external;}
contract SessionBlackjackGameTest {
 TableVm constant vm=TableVm(address(uint160(uint256(keccak256("hevm cheat code")))));
 uint256 constant PLAYER=123;uint256 constant DEALER=456;
 SessionBlackjackGame game;PlayerVault vault;VaultToken token;address player;address dealer;bytes32 id;bytes32 domain;bytes32 entropy=bytes32(uint256(77));
 function setUp() public {
  vm.chainId(8453);player=vm.addr(PLAYER);dealer=vm.addr(DEALER);token=new VaultToken();game=new SessionBlackjackGame(token,address(this),dealer);vault=game.vault();
  token.mint(address(this),10000e6);token.approve(address(vault),10000e6);vault.fundHouse(10000e6);vault.setPaused(false);
  token.mint(player,1000e6);vm.prank(player);token.approve(address(vault),1000e6);vault.depositFor(player,1000e6);
  vm.prank(player);id=game.openTable(vm.addr(PLAYER+1),100e6,35e6,uint64(block.timestamp+3600));
  domain=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("BonkersTable"),keccak256("1"),uint256(8453),address(game)));
 }
 function sig(uint256 key,bytes32 digest) internal returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(key,digest);return abi.encodePacked(r,s,v);}
 function offer(uint8 n,uint64 nonce) internal returns(TableTypes.Offer memory o){
  o.tableId=id;o.nonce=nonce;o.validUntil=uint64(block.timestamp+1800);o.seats=new uint8[](n);o.stakes=new uint128[](n);o.commitments=new bytes32[](n);
  for(uint8 i;i<n;i++){o.seats[i]=i;o.stakes[i]=1e6;o.commitments[i]=keccak256(abi.encode(bytes32(uint256(i+9))));}o.signature=sig(DEALER,game.offerHash(o));
 }
 function proofs(TableTypes.Offer memory o,bool incomplete,uint8 preferred) internal returns(TableTypes.Proof[] memory all){
  all=new TableTypes.Proof[](o.seats.length);bytes32 bet=game.betHash(o,entropy);
  for(uint256 j;j<all.length;j++){
   TableTypes.Proof memory p;p.seed=bytes32(uint256(j+9));bytes32 shuffleEntropy=keccak256(abi.encode(id,o.nonce,o.seats[j],entropy));uint16[312] memory deck=R.deck(p.seed,shuffleEntropy);R.State memory s=R.initial(deck,1);
   uint8[] memory moves=new uint8[](128);bytes32[] memory observations=new bytes32[](129);bytes[] memory signatures=new bytes[](128);bytes[] memory acknowledgements=new bytes[](128);uint256 count;
   while(!incomplete&&!s.done){uint8 move=preferred;if((R.legalMoves(R.observation(s))&(uint8(1)<<move))==0)move=2;
    observations[count]=keccak256(R.observation(s));moves[count]=move;bytes32 action=TableTypes.typed(domain,keccak256(abi.encode(TableTypes.ACTION,bet,o.seats[j],uint32(count),move,observations[count])));
    signatures[count]=sig(PLAYER+1,action);acknowledgements[count]=sig(DEALER,TableTypes.typed(domain,keccak256(abi.encode(TableTypes.ACK,action))));R.step(s,deck,R.Action(0,move));count++;
   }
   observations[count]=keccak256(R.observation(s));assembly("memory-safe"){mstore(moves,count) mstore(observations,add(count,1)) mstore(signatures,count) mstore(acknowledgements,count)}
   p.moves=moves;p.observations=observations;p.signatures=signatures;p.acknowledgements=acknowledgements;all[j]=p;
  }
 }
 function betSig(TableTypes.Offer memory o) internal returns(bytes memory){return sig(PLAYER+1,game.betHash(o,entropy));}
 function close(uint64 nonce) internal {bytes32 digest=TableTypes.typed(domain,keccak256(abi.encode(game.CLOSE(),id,nonce)));game.closeTableCooperative(id,nonce,sig(PLAYER+1,digest),sig(DEALER,digest));}
 function intact() internal view {require(token.balanceOf(address(vault))==vault.accountedAssets(),"accounting");require(vault.house()>=vault.reserved(),"collateral");}
 function testSevenHandsOneSettlementAndNoReplay() public {TableTypes.Offer memory o=offer(7,0);TableTypes.Proof[] memory p=proofs(o,false,2);bytes memory b=betSig(o);game.settleTableRound(o,entropy,b,p);intact();vm.expectRevert();game.settleTableRound(o,entropy,b,p);close(1);require(vault.playerLocked()==0&&vault.reserved()==0);intact();}
 function testPlayerCannotWithdrawTableEscrowAndDealerCannotWithdraw() public {vm.expectRevert();vm.prank(player);vault.withdraw(1000e6,player);vm.expectRevert();vm.prank(dealer);vault.withdraw(1e6,dealer);vm.expectRevert();vm.prank(dealer);vault.withdrawProfit(1e6);vm.expectRevert();vm.prank(dealer);game.requestTableClose(id);intact();}
 function testForgedActionAndWrongSeedCannotSettle() public {TableTypes.Offer memory o=offer(7,0);TableTypes.Proof[] memory p=proofs(o,false,2);bytes memory b=betSig(o);p[0].seed=bytes32(uint256(999));vm.expectRevert();game.settleTableRound(o,entropy,b,p);p=proofs(o,false,2);for(uint256 i;i<p.length;i++)if(p[i].signatures.length>0){p[i].signatures[0]=sig(999,bytes32(0));break;}vm.expectRevert();game.settleTableRound(o,entropy,b,p);intact();}
 function testDoubleAndInsuranceReplayWithExactAccounting() public {TableTypes.Offer memory o=offer(7,0);game.settleTableRound(o,entropy,betSig(o),proofs(o,false,3));intact();close(1);intact();}
 function testWithheldSeedMaximumRecoveryAndClose() public {TableTypes.Offer memory o=offer(2,0);game.disputeTableRound(o,entropy,betSig(o));vm.expectRevert();game.finalizeTableDispute(id);vm.prank(player);game.requestTableClose(id);vm.warp(block.timestamp+1 days);game.claimTableClose(id);require(vault.available(player)==1030e6&&vault.house()==9970e6&&vault.reserved()==0&&vault.playerLocked()==0);intact();}
 function testPartialTranscriptRecoveryDeclinesAndStandsAndCannotDowngrade() public {TableTypes.Offer memory o=offer(7,0);bytes memory b=betSig(o);game.disputeTableRound(o,entropy,b);game.answerTableDispute(o,entropy,b,proofs(o,true,2));game.answerTableDispute(o,entropy,b,proofs(o,false,2));TableTypes.Proof[] memory older=proofs(o,true,2);vm.expectRevert();game.answerTableDispute(o,entropy,b,older);vm.warp(block.timestamp+1 days);game.finalizeTableDispute(id);close(1);intact();}
 function testCannotInventActionsAfterSeedRevealWithoutDealerAcknowledgement() public {TableTypes.Offer memory o=offer(7,0);bytes memory b=betSig(o);game.disputeTableRound(o,entropy,b);game.answerTableDispute(o,entropy,b,proofs(o,true,2));TableTypes.Proof[] memory p=proofs(o,false,1);for(uint256 i;i<p.length;i++)if(p[i].acknowledgements.length>0){p[i].acknowledgements[0]=sig(PLAYER,bytes32(0));break;}vm.expectRevert();game.answerTableDispute(o,entropy,b,p);intact();}
 function testOneSidedCloseAndPausedWithdrawal() public {vm.prank(player);game.requestTableClose(id);vm.expectRevert();game.claimTableClose(id);vm.warp(block.timestamp+1 days);game.claimTableClose(id);vault.setPaused(true);vm.prank(player);vault.withdraw(1000e6,player);require(token.balanceOf(player)==1000e6);intact();}
 function testHouseCannotWithdrawReservedSessionCollateral() public {require(vault.reserved()==525e6);vm.expectRevert();vault.withdrawProfit(10000e6);close(0);vault.withdrawProfit(10000e6);require(vault.house()==0);intact();}
 function testChangedStakeOrPlayerBetRejected() public {TableTypes.Offer memory o=offer(1,0);bytes memory b=betSig(o);o.stakes[0]=5e6;vm.expectRevert();game.disputeTableRound(o,entropy,b);o=offer(1,0);bytes memory forged=sig(PLAYER,game.betHash(o,entropy));vm.expectRevert();game.disputeTableRound(o,entropy,forged);intact();}
 function testSplitAndSurrenderAndInsurance() public {for(uint8 n=4;n<=7;n++){if(n==6)continue;TableTypes.Offer memory o=offer(7,uint64(n==4?0:n==5?1:2));game.settleTableRound(o,entropy,betSig(o),proofs(o,false,n));intact();}close(3);intact();}
 function testCannotDoubleBeyondEscrowBalance() public {close(0);vm.prank(player);id=game.openTable(vm.addr(PLAYER+1),7e6,7e6,uint64(block.timestamp+3600));TableTypes.Offer memory o=offer(7,0);TableTypes.Proof[] memory p=proofs(o,false,3);bytes memory b=betSig(o);vm.expectRevert();game.settleTableRound(o,entropy,b,p);intact();}
 function testExpiredTableCanBeClosedWithoutDealerOrPlayerKey() public {vm.expectRevert();game.requestTableClose(id);vm.warp(block.timestamp+3600);game.requestTableClose(id);vm.warp(block.timestamp+1 days);game.claimTableClose(id);require(vault.available(player)==1000e6&&vault.playerLocked()==0&&vault.reserved()==0);intact();}
 function testOwnerCanCloseCooperativelyAfterLosingSessionKey() public {bytes32 digest=TableTypes.typed(domain,keccak256(abi.encode(game.CLOSE(),id,uint64(0))));game.closeTableCooperative(id,0,sig(PLAYER,digest),sig(DEALER,digest));require(vault.available(player)==1000e6&&vault.reserved()==0);intact();}
}
