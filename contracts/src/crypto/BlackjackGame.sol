// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {PlayerVault,IERC20} from "./PlayerVault.sol";
import {BlackjackReplay as Replay} from "./BlackjackReplay.sol";
/// @notice Unreviewed protocol candidate; contract enforces replay and collateralized failure exits.
contract BlackjackVerifier {
    function verify(bytes32 seed,bytes32 entropy,uint128[] memory stakes,Replay.Action[] memory actions,bytes32[] memory observations,uint128[] memory added) external pure returns(uint128[] memory){return Replay.verify(seed,entropy,stakes,actions,observations,added);}
}
contract BlackjackGame {
    BlackjackVerifier public immutable verifier;
    PlayerVault public immutable vault;
    address public immutable operator;
    address public immutable pilotOwner; // Base mainnet candidate is strictly owner-only until separately audited.
    uint64 public constant TURN_SECONDS=30;
    uint64 public constant OPERATOR_SECONDS=60;
    struct Round {
        bytes32 commitment; bytes32 entropy; uint64 deadline; uint8 phase; uint8 active; uint8 legal;
        address[] players; uint128[] stakes; uint128[] added; bytes32[] entropies;
        Replay.Action[] actions; bytes32[] observations;
    }
    mapping(bytes32=>Round) private rounds;
    event Offered(bytes32 indexed id,bytes32 commitment,uint64 deadline);
    event Joined(bytes32 indexed id,address indexed player,uint8 seat,uint128 stake,bytes32 entropy);
    event Started(bytes32 indexed id,bytes32 entropy);
    event Observed(bytes32 indexed id,bytes data,bool done,uint8 active,uint64 deadline);
    event Acted(bytes32 indexed id,uint8 seat,uint8 move,uint128 extra,bool automatic);
    event Finished(bytes32 indexed id,bytes32 seed,bool failure);
    constructor(IERC20 token,address treasury,address dealer){require(dealer!=address(0),"operator");operator=dealer;pilotOwner=block.chainid==8453?treasury:address(0);verifier=new BlackjackVerifier();vault=new PlayerVault(token,address(this),treasury);}
    modifier onlyOperator(){require(msg.sender==operator,"operator only");_;}
    function exposure(bytes32 id,uint256 seat) public view returns(bytes32){return keccak256(abi.encode(address(this),id,seat));}
    function offer(bytes32 id,bytes32 commitment) external onlyOperator {
        Round storage r=rounds[id];require(r.phase==0&&commitment!=bytes32(0),"used round");r.commitment=commitment;r.phase=1;r.deadline=uint64(block.timestamp+OPERATOR_SECONDS);emit Offered(id,commitment,r.deadline);
    }
    function join(bytes32 id,uint128 stake,bytes32 entropy) external {
        require(pilotOwner==address(0)||(msg.sender==pilotOwner&&stake<=5e6),"owner pilot only, max 5 USDC");
        Round storage r=rounds[id];require(r.phase==1&&block.timestamp<r.deadline&&r.players.length<7,"betting closed");
        for(uint256 i=0;i<r.players.length;i++)require(r.players[i]!=msg.sender,"already seated");
        vault.lock(exposure(id,r.players.length),msg.sender,stake);
        r.players.push(msg.sender);r.stakes.push(stake);r.added.push(0);r.entropies.push(entropy);emit Joined(id,msg.sender,uint8(r.players.length-1),stake,entropy);
    }
    function start(bytes32 id) external onlyOperator {
        Round storage r=rounds[id];require(r.phase==1&&r.players.length>0&&block.timestamp<r.deadline,"start");
        r.entropy=keccak256(abi.encode(address(this),block.chainid,id,r.entropies));r.phase=2;r.deadline=uint64(block.timestamp+OPERATOR_SECONDS);emit Started(id,r.entropy);
    }
    function observe(bytes32 id,bytes calldata data) external onlyOperator {
        Round storage r=rounds[id];require(r.phase==2&&block.timestamp<r.deadline&&data.length>=5&&data.length<=2048,"observation");
        require(uint8(data[0])==1&&uint8(data[1])<=1&&uint8(data[3])==r.players.length,"format");bool done=data[1]==0x01;uint8 active=uint8(data[2]);
        require(done?active==r.players.length:active<r.players.length,"seat");
        r.legal=done?0:Replay.legalMoves(data);r.observations.push(keccak256(data));r.active=active;r.phase=done?4:3;r.deadline=uint64(block.timestamp+(done?OPERATOR_SECONDS:TURN_SECONDS));emit Observed(id,data,done,active,r.deadline);
    }
    function act(bytes32 id,uint8 move,uint128 extra,bytes32 expectedObservation) external {
        Round storage r=rounds[id];require(r.phase==3&&block.timestamp<r.deadline&&r.players[r.active]==msg.sender,"turn");
        require(r.observations[r.observations.length-1]==expectedObservation,"stale observation");
        require(move>=1&&move<=4&&(r.legal & (uint8(1)<<move))!=0&&((move<=2&&extra==0)||(move>=3&&extra==r.stakes[r.active])),"action stake");
        if(extra>0){vault.addStake(exposure(id,r.active),extra);r.added[r.active]+=extra;}
        _act(id,r,move,extra,false);
    }
    function autoStand(bytes32 id) external {
        Round storage r=rounds[id];require(r.phase==3&&block.timestamp>=r.deadline,"timer");_act(id,r,2,0,true);
    }
    function _act(bytes32 id,Round storage r,uint8 move,uint128 extra,bool automatic) private {
        require(r.actions.length<512,"action limit");r.actions.push(Replay.Action(r.active,move));r.phase=2;r.deadline=uint64(block.timestamp+OPERATOR_SECONDS);emit Acted(id,r.active,move,extra,automatic);
    }
    function settle(bytes32 id,bytes32 seed) external {
        Round storage r=rounds[id];require(r.phase==4&&block.timestamp<r.deadline&&keccak256(abi.encode(seed))==r.commitment,"reveal");
        uint128[] memory paid=verifier.verify(seed,r.entropy,r.stakes,r.actions,r.observations,r.added);
        r.phase=5;for(uint256 i=0;i<paid.length;i++)vault.settle(exposure(id,i),paid[i],false);emit Finished(id,seed,false);
    }
    function claimFailure(bytes32 id) external {
        Round storage r=rounds[id];require((r.phase==1||r.phase==2||r.phase==4)&&block.timestamp>=r.deadline,"no operator timeout");
        r.phase=5;for(uint256 i=0;i<r.players.length;i++)vault.settle(exposure(id,i),r.stakes[i]*16,true);emit Finished(id,bytes32(0),true);
    }
    function state(bytes32 id) external view returns(uint8 phase,uint64 deadline,uint8 active,bytes32 entropy,address[] memory players,uint128[] memory stakes,uint128[] memory added,uint256 actionCount){Round storage r=rounds[id];return(r.phase,r.deadline,r.active,r.entropy,r.players,r.stakes,r.added,r.actions.length);}
}
