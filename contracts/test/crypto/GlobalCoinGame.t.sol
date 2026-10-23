// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {GlobalCoinGame,PlayerVault} from "../../src/crypto/GlobalCoinGame.sol";
import {VaultToken} from "./PlayerVault.t.sol";
interface CoinVm {function prank(address) external;function warp(uint256) external;function chainId(uint256) external;function expectRevert() external;}
contract GlobalCoinGameTest {
 CoinVm constant vm=CoinVm(address(uint160(uint256(keccak256("hevm cheat code")))));
 GlobalCoinGame game;PlayerVault vault;VaultToken token;address player=address(123);uint64 constant START=29879754;
 function proof(uint256 index) internal pure returns(bytes memory){
  if(index==0)return hex"166981fe48bb64e80d53d8f56fb7b83dda2b2f10acf6f49894d2a796e30312e1254d86cb06ff0ba5fc33ef1804b09a6d1cfe9b5ab8b4b52b3d969db18d0d3d9e";
  if(index==1)return hex"2dd09073f00b61ea3e425b36ea218dc20f816f6827732fc00047084006914ba51b7a69024d4a2355bcc80987b2f3644c5b7979b0f479f4dba57172a431b9333f";
  if(index==2)return hex"2b47bc5b00b707c17f1919f4ca222a37369f6abdefab541f4111a825675d98290ef04de4ef64be7672aa15a862359e6e302d24cf34e277a6b68b31a4343cebfe";
  if(index==3)return hex"2c23f5c56adfa46fa90685638cc2660b4a2a1d344d410341338918c6dbe14305177e336bc57e92ef050013ba09443e9ea5d9f6e3986e1efb3a32a8fbde678555";
  if(index==4)return hex"148d774d5ed69c90fa906d2b5e4722af9cd733a1815659a96abc3b0b0a2a03881565ca873a8d28a788bd1bc12711d8b2600cb6f3cee1b3f0d1fc306266578a83";
  if(index==5)return hex"0ed6c9739739fcf763a617d5b4ab3d4f850b385a79e31c0494ab67fa519bff1f2180b492199afbdd54ab72c94b271a9905db41cdf80038d7a0f462edfa0184b6";
  if(index==6)return hex"303ecfc5ee4223bda13e6e24cca9cfd0743e3149f3121f861061c56b423c7c560098ab3f65f89d9625756b1659ed44a5f898fd0e0cb3ec85f8f24a3895bf1e9a";
  if(index==7)return hex"071338bc318114c1a9740c4aad0fca96eb4e197464c24e05d5336feddd4a6de513fc546507f4ff54f18b4afd23c408ac4fb9fde0708afaa5c6c279a179da571e";
  if(index==8)return hex"10da5d54cd06db6cc81d9fa8e99622cc92dfebbe9a538223529cd96ca08850ae1784aca2acb90d79231b48afee17bde5cb4eb04de5e829b875729f7f775af3ca";
  if(index==9)return hex"2b653d05e63f4fd76cdd16696229b564b89b3eb0635bfb707157f48529a79aa623dee00f4a608fe1655a8a7577dc931c63bf1c97995de777443c66d3832b0985";
  if(index==10)return hex"261e4fff7dbae23dd35aa1080ee995bd1fd16db6201c91013b2112c50b3ee7ca287140583196e3b367d12b3cd623e92e56da9bf6a6d2eed3b190f6d89b2a44ed";
  if(index==11)return hex"03f603d0cb5977a3f0b935fcd15cb07d4a2dbb392c24ea6cf4fccaaac81ecb3f018b80417155c7e7ad646a290e051b001d7e5a4937cc6c8837a1ecf26e8a828a";
  if(index==12)return hex"09387023fb58bf470bde91b5fcfef08d82cd4ae67251fa7b8bee4be90eba9acc0fcaee9b5f74afc87fd63c38c7516d691193d572090a98a602dcaef621782f97";
  if(index==13)return hex"20eb82193754ec491df8f1ce2174d19df12b92fbaf6754fcad9ab5cc0c1865f405a2fb831c87d149bffa5bc5f416914eb8930e3f447bd911e01fd3105d488237";
  if(index==14)return hex"18aca36a00daca8df8a41ce1498ed9522588ea1924416cd1eb1f6f9b6148f98d18b5b0638988c9c27f7a1342979c2be75a17715822f0e93d2c24d1276f611381";
  if(index==15)return hex"21b240ec95e77692c44499544c39496ea549ef8695948cd736bbfa494830c604296f5e72798551933faec65c8ac08c5e996aa63c9349a627c99c416a057a551d";
  if(index==16)return hex"0785fd252bdec4537c38911df9a20d1b2ff1032c3310d9009a5e1a90f274299608c24e152832bf4b06c6c4abb67578642751da4593d72c5b25f6377dc1a9aabf";
  if(index==17)return hex"062e2f36cc5f9899a868fcc8c4dc4b6316178cd958f7cbac523720629ef0151c24b22ea2da08a19d9a7729300238e32d7d17315b2053c5952dca0702b1c261f6";
  if(index==18)return hex"26546eb412d585b948810c2b5b7a6ab6912f26dc5a8ff137368768cfe6d027861802d4403ab07815c5fde4ed9b50899b1e56fed635461d434117f7e67d085b53";
  if(index==19)return hex"151f26bcaff8301c8c0439cd08bb029a5484b068d544f1d0df67ef32f2d36a262d755598aa28a5d3c635898745aaf0ffe98c6d6fe157a8ba4944b667c4c6f875";
  if(index==20)return hex"16bf95dfc1b4ba0c0ec7aa3829abf68ef178f87898c27b40b2abc7d908675c6b2613fe44b5efcdf2102b4288a67099190780edaba4fec992051837da7bc29e9e";
  revert("fixture index");
 }
 function setUp() public {vm.chainId(8453);vm.warp(START*60+1);token=new VaultToken();game=new GlobalCoinGame(token,address(this));vault=game.vault();token.mint(address(this),2000e6);token.approve(address(vault),2000e6);vault.fundHouse(2000e6);vault.setPaused(false);token.mint(player,100e6);vm.prank(player);token.approve(address(vault),100e6);vault.depositFor(player,100e6);}
 function bet(uint8 count,uint8 choice,uint128 stake) internal returns(bytes32){vm.prank(player);return game.placeBet(START,count,choice,stake);}
 function prove(uint8 count) internal {vm.warp((START+count)*60+3);for(uint64 i;i<count;i++)game.publishFlip(START+i,proof(i));}
 function test_real_drand_signature_settles_same_global_flip_for_all_bettors() public {bytes32 h=bet(1,0,5e6);bytes32 t=bet(1,1,5e6);require(vault.reserved()==10020000);prove(1);game.settle(h);game.settle(t);require(vault.available(player)==99980000);require(vault.reserved()==0);require(vault.playerLocked()==0);require(token.balanceOf(address(vault))==vault.accountedAssets());}
 function test_real_11_and_21_majorities_span_future_minutes() public {bytes32 a=bet(11,0,1e6);bytes32 b=bet(21,1,1e6);vm.expectRevert();game.settle(a);prove(21);game.settle(a);game.settle(b);uint256 heads;for(uint64 i;i<21;i++)if(game.results(START+i)==1)heads++;uint256 heads11;for(uint64 i;i<11;i++)if(game.results(START+i)==1)heads11++;require(vault.available(player)==98e6+(heads11>5?2e6:0)+(heads<11?2e6:0));require(vault.reserved()==0);}
 function test_exact_ten_second_cutoff_and_no_silent_rollover() public {vm.warp(START*60+49);bet(1,0,1e6);uint256 before=vault.available(player);vm.warp(START*60+50);vm.expectRevert();bet(1,0,1e6);vm.warp((START+1)*60);vm.expectRevert();bet(1,0,1e6);require(vault.available(player)==before);vm.prank(player);game.placeBet(START+1,1,0,1e6);}
 function test_invalid_signature_never_publishes_or_settles() public {bet(1,0,1e6);vm.warp((START+1)*60+3);bytes memory sig=proof(0);sig[10]=bytes1(uint8(sig[10])^1);vm.expectRevert();game.publishFlip(START,sig);require(game.results(START)==0);}
 function test_future_publish_and_replay_rejected() public {vm.expectRevert();game.publishFlip(START,proof(0));prove(1);vm.expectRevert();game.publishFlip(START,proof(0));}
 function test_missing_result_refunds_wager_and_fee_only_after_24_hours() public {bytes32 id=bet(21,0,5e6);vm.warp((START+21)*60+86399);vm.expectRevert();game.refundMissing(id);vm.warp((START+21)*60+86400);game.refundMissing(id);require(vault.available(player)==100e6);require(vault.feeRevenue()==0);require(vault.reserved()==0);vault.setPaused(true);vm.prank(player);vault.withdraw(100e6,player);require(token.balanceOf(player)==100e6);}
 function test_proven_loss_cannot_be_refunded_and_settlement_cannot_repeat() public {uint8 side=uint256(sha256(proof(0)))%2==0?1:0;bytes32 id=bet(1,side,5e6);prove(1);vm.warp((START+1)*60+86400);vm.expectRevert();game.refundMissing(id);game.settle(id);vm.expectRevert();game.settle(id);require(vault.available(player)==94990000);}
 function test_house_cannot_withdraw_reserved_collateral_or_player_balance() public {bet(1,0,5e6);uint256 house=vault.house();vm.expectRevert();vault.withdrawProfit(house);vm.expectRevert();vault.settleCoin(bytes32(0),1e6,false);require(vault.available(player)==94990000);}
 function test_house_capacity_is_checked_before_acceptance() public {vault.withdrawProfit(1994e6);bet(1,0,5e6);uint256 before=vault.available(player);vm.expectRevert();bet(1,0,5e6);require(vault.available(player)==before);require(game.pending()==1);}
 function test_even_batches_and_invalid_side_rejected() public {vm.expectRevert();bet(10,0,1e6);vm.expectRevert();bet(20,0,1e6);vm.expectRevert();bet(11,2,1e6);}
}
