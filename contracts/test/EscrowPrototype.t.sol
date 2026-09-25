// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {EscrowPrototype, IERC20Demo, IBlackjackVerifier, RejectingVerifier} from "../src/EscrowPrototype.sol";
interface Vm { function prank(address) external; function warp(uint256) external; function expectRevert() external; function chainId(uint256) external; }
contract MockToken is IERC20Demo {
    mapping(address=>uint256) public balanceOf;
    function mint(address who,uint256 amount) external {balanceOf[who]+=amount;}
    function transfer(address to,uint256 amount) external returns(bool){balanceOf[msg.sender]-=amount;balanceOf[to]+=amount;return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){balanceOf[from]-=amount;balanceOf[to]+=amount;return true;}
}
// TEST DOUBLE ONLY. Not a shuffle verifier and must never be deployed with real value.
contract MockVerifier is IBlackjackVerifier {
    function verify(bytes32,address,bytes32,uint256,bytes calldata proof) external pure returns(uint256){return abi.decode(proof,(uint256));}
}
contract EscrowTest {
    Vm constant vm=Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockToken token;EscrowPrototype escrow;address alice=address(0xA11CE);address session=address(0x515);bytes32 id=keccak256("round-1");
    function setUp() public {vm.chainId(31337);token=new MockToken();escrow=new EscrowPrototype(token,new MockVerifier());token.mint(address(this),1000000);token.mint(alice,10000);escrow.fundHouse(1000000);vm.prank(alice);escrow.deposit(10000);escrow.publishOffer(id,alice,keccak256("seed"),1000,16000,uint64(block.timestamp+60));}
    function lock() internal {vm.prank(alice);escrow.lockWager(id,alice,keccak256("seed"),1000,16000,uint64(block.timestamp+60));}
    function invariantBalance() internal view {require(escrow.accountedAssets()==token.balanceOf(address(escrow)),"liability mismatch");}
    function testDepositWithdrawAndConservation() public {vm.prank(alice);escrow.withdraw(2500);require(escrow.available(alice)==7500);invariantBalance();}
    function testValidSettlementReleasesReserveAndCannotReplay() public {lock();require(escrow.reserved()==15000);escrow.settle(id,abi.encode(2500));require(escrow.available(alice)==11500);require(escrow.reserved()==0);vm.expectRevert();escrow.settle(id,abi.encode(2500));invariantBalance();}
    function testTimeoutPaysMaximumEvenWhenPaused() public {lock();escrow.setPaused(true);vm.warp(block.timestamp+60);escrow.claimTimeout(id);require(escrow.available(alice)==25000);vm.prank(alice);escrow.withdraw(25000);invariantBalance();}
    function testExpiredAndRevokedSessionsCannotSpend() public {vm.prank(alice);escrow.authorizeSession(session,1000,uint64(block.timestamp+30));vm.warp(block.timestamp+31);vm.expectRevert();vm.prank(session);escrow.lockWager(id,alice,keccak256("seed"),1000,16000,uint64(61));vm.prank(alice);escrow.authorizeSession(session,1000,uint64(block.timestamp+30));vm.prank(alice);escrow.revokeSession(session);vm.expectRevert();vm.prank(session);escrow.lockWager(id,alice,keccak256("seed"),1000,16000,uint64(61));}
    function testSessionCapAndNoWithdrawalRedirection() public {vm.prank(alice);escrow.authorizeSession(session,1000,uint64(block.timestamp+30));vm.prank(session);escrow.lockWager(id,alice,keccak256("seed"),1000,16000,uint64(61));vm.expectRevert();vm.prank(session);escrow.lockWager(keccak256("second"),alice,keccak256("seed"),1,2,uint64(block.timestamp+60));vm.expectRevert();vm.prank(session);escrow.withdraw(1000);invariantBalance();}
    function testInsufficientHouseAndReservedProfitProtection() public {escrow.withdrawHouse(999999);vm.expectRevert();lock();escrow.fundHouse(999999);lock();vm.expectRevert();escrow.withdrawHouse(1000000);invariantBalance();}
    function testOverpaymentUnknownRoundDuplicateRoundRejected() public {vm.expectRevert();escrow.settle(id,abi.encode(1));lock();vm.expectRevert();lock();vm.expectRevert();escrow.settle(id,abi.encode(16001));invariantBalance();}
    function testNonTestChainsBlocked() public {MockVerifier verifier=new MockVerifier();vm.chainId(8453);vm.expectRevert();new EscrowPrototype(token,verifier);}
    function testRejectingVerifierFailsClosed() public {EscrowPrototype safe=new EscrowPrototype(token,new RejectingVerifier());token.mint(address(this),20000);safe.fundHouse(20000);token.mint(alice,1000);vm.prank(alice);safe.deposit(1000);safe.publishOffer(id,alice,keccak256("seed"),1000,16000,uint64(block.timestamp+60));vm.prank(alice);safe.lockWager(id,alice,keccak256("seed"),1000,16000,uint64(block.timestamp+60));vm.expectRevert();safe.settle(id,abi.encode(2000));}
    function testFuzzPayoutConservation(uint96 raw) public {lock();uint256 payout=uint256(raw)%16001;escrow.settle(id,abi.encode(payout));require(escrow.available(alice)==9000+payout);invariantBalance();}
}
