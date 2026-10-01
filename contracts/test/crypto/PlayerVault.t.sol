// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {PlayerVault} from "../../src/crypto/PlayerVault.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
interface VaultVm {
    function prank(address) external;
    function expectRevert() external;
    function addr(uint256) external returns(address);
    function sign(uint256,bytes32) external returns(uint8,bytes32,bytes32);
}
contract VaultToken is ERC20 {
    constructor() ERC20("Test USDC","USDC") {}
    function decimals() public pure override returns(uint8){return 6;}
    function mint(address owner,uint256 amount) external {_mint(owner,amount);}
}
contract PlayerVaultTest {
    VaultVm constant vm=VaultVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    VaultToken token; PlayerVault vault; address alice; bytes32 constant ID=keccak256("one");
    function setUp() public {
        alice=vm.addr(123);token=new VaultToken();vault=new PlayerVault(token,address(this),address(this));
        token.mint(address(this),10000e6);token.approve(address(vault),type(uint256).max);vault.fundHouse(10000e6);
        token.mint(alice,1000e6);vm.prank(alice);token.approve(address(vault),type(uint256).max);
        vault.setPaused(false);vault.depositFor(alice,1000e6);
    }
    function conserved() internal view {
        require(vault.accountedAssets()==token.balanceOf(address(vault)),"conservation");
        require(vault.house()>=vault.reserved(),"solvency");
    }
    function testSponsorCannotStealDeposit() public {
        require(vault.available(address(this))==0);require(vault.available(alice)==1000e6);
        vm.expectRevert();vault.withdraw(1,address(this));conserved();
    }
    function testPausePreservesOwnerExit() public {
        vault.setPaused(true);vm.prank(alice);vault.withdraw(1000e6,alice);
        require(token.balanceOf(alice)==1000e6);conserved();
    }
    function testFeeReservedUntilFailureRefund() public {
        vault.lock(ID,alice,100e6);require(vault.reserved()==1500250000);
        vault.withdrawProfit(vault.house()-vault.reserved());
        vault.settle(ID,1600e6,true);require(vault.available(alice)==2500e6);
        require(vault.house()==0 && vault.feeRevenue()==0);conserved();
    }
    function testDoubleAndSplitConservation() public {
        vault.lock(ID,alice,100e6);vault.addStake(ID,700e6);vault.settle(ID,1600e6,false);
        require(vault.available(alice)==1799750000);require(vault.feeRevenue()==250000);conserved();
        vm.expectRevert();vault.settle(ID,0,false);
    }
    function testUnauthorizedAndUnfundedWagersRejected() public {
        vm.expectRevert();vm.prank(alice);vault.lock(ID,alice,5e6);
        vault.withdrawProfit(10000e6);vm.expectRevert();vault.lock(ID,alice,5e6);conserved();
    }
    function testSignedWithdrawalBindsDestinationAndRejectsReplay() public {
        uint256 deadline=block.timestamp+60;
        bytes32 domain=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("BonkersPlayerVault"),keccak256("1"),block.chainid,address(vault)));
        bytes32 body=keccak256(abi.encode(vault.WITHDRAW_TYPEHASH(),alice,alice,10e6,0,deadline));
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(123,keccak256(abi.encodePacked("\x19\x01",domain,body)));
        bytes memory signature=abi.encodePacked(r,s,v);
        vm.expectRevert();vault.withdrawSigned(alice,address(this),10e6,0,deadline,signature);
        vault.withdrawSigned(alice,alice,10e6,0,deadline,signature);
        vm.expectRevert();vault.withdrawSigned(alice,alice,10e6,0,deadline,signature);conserved();
    }
    function testFuzzSettlementPreservesAssets(uint96 raw) public {
        vault.lock(ID,alice,5e6);vault.settle(ID,uint128(uint256(raw)%80000001),false);conserved();
    }
    function testIndependentWalletCanDepositWithdrawOnlyOwnFunds() public {
        address bob=vm.addr(456);token.mint(bob,20e6);vm.prank(bob);token.approve(address(vault),20e6);vault.depositFor(bob,20e6);
        vm.prank(bob);vault.withdraw(20e6,bob);require(token.balanceOf(bob)==20e6);require(vault.available(alice)==1000e6);
        vm.expectRevert();vm.prank(bob);vault.withdraw(1,bob);vm.expectRevert();vm.prank(bob);vault.withdrawProfit(1);conserved();
    }

}
