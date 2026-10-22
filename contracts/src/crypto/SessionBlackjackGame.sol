// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {PlayerVault,IERC20} from "./PlayerVault.sol";
import {BlackjackReplay as R} from "./BlackjackReplay.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

library TableTypes {
    bytes32 internal constant ACTION=keccak256("TableAction(bytes32 betHash,uint8 seat,uint32 index,uint8 move,bytes32 observation)");
    bytes32 internal constant ACK=keccak256("TableAcknowledgement(bytes32 actionDigest)");
    struct Offer {bytes32 tableId;uint64 nonce;uint64 validUntil;uint8[] seats;uint128[] stakes;bytes32[] commitments;bytes signature;}
    struct Proof {bytes32 seed;uint8[] moves;bytes32[] observations;bytes[] signatures;bytes[] acknowledgements;}
    function typed(bytes32 domain,bytes32 message) internal pure returns(bytes32){return keccak256(abi.encodePacked(hex"1901",domain,message));}
}

/// @dev Separate runtime keeps replay and signature verification below the EIP-170 game size limit.
contract TableVerifier {
    function verify(TableTypes.Proof calldata p,bytes32 entropy,uint128 stake,bytes32 betHash,uint8 seat,address key,address dealer,bytes32 domain,bool finish) external view returns(uint128 spent,uint128 paid,bytes32 transcript){
        uint256 n=p.moves.length;require(n<=128&&p.observations.length==n+1&&p.signatures.length==n&&p.acknowledgements.length==n,"proof bound");
        uint16[312] memory deck=R.deck(p.seed,entropy);R.State memory state=R.initial(deck,1);spent=stake;
        for(uint256 i;i<n;i++){
            require(keccak256(R.observation(state))==p.observations[i],"observation");
            bytes32 action=TableTypes.typed(domain,keccak256(abi.encode(TableTypes.ACTION,betHash,seat,uint32(i),p.moves[i],p.observations[i])));
            require(SignatureChecker.isValidSignatureNow(key,action,p.signatures[i]),"player action");
            require(SignatureChecker.isValidSignatureNow(dealer,TableTypes.typed(domain,keccak256(abi.encode(TableTypes.ACK,action))),p.acknowledgements[i]),"dealer acknowledgement");
            spent+=stake*R.step(state,deck,R.Action(0,p.moves[i]))/2;
        }
        require(keccak256(R.observation(state))==p.observations[n],"final observation");
        if(finish){for(uint256 i;!state.done&&i<129;i++)R.step(state,deck,R.Action(0,2));}
        uint128[] memory stakes=new uint128[](1);stakes[0]=stake;paid=R.payouts(state,stakes)[0];
        transcript=keccak256(abi.encode(p.moves,p.observations));
    }
}

/// @notice Candidate session protocol: instant signed decisions; one replay-verified settlement per layout.
/// @dev Fault recovery has a 24-hour challenge window. No operator can withdraw a player's USDC.
contract SessionBlackjackGame is EIP712 {
    PlayerVault public immutable vault;
    address public immutable operator;
    uint8 public constant rulesVersion=2;
    uint64 public constant OPERATOR_SECONDS=60;
    modifier onlyOperator(){require(msg.sender==operator,"operator only");_;}
    uint8 public constant tableVersion=1;
    uint256 public activeTables;
    uint64 public constant CHALLENGE_SECONDS=1 days;
    TableVerifier public immutable tableVerifier;
    bytes32 public constant OFFER=keccak256("TableOffer(bytes32 tableId,uint64 nonce,uint64 validUntil,bytes32 layoutHash,bytes32 commitmentsHash)");
    bytes32 public constant BET=keccak256("TableBet(bytes32 offerHash,bytes32 entropy)");
    bytes32 public constant CLOSE=keccak256("TableClose(bytes32 tableId,uint64 nonce)");
    struct Table {address owner;address key;uint64 opened;uint64 expires;uint64 nonce;uint64 closeAt;uint64 disputeAt;bytes32 disputedOffer;uint128 failureProfit;bool closed;bool answered;uint128 spent;uint128 payout;uint128 fee;}
    mapping(bytes32=>Table) public tableState;
    mapping(address=>bytes32) public ownerTable;
    mapping(address=>uint256) private openings;
    mapping(bytes32=>uint32[]) private disputeSteps;
    mapping(bytes32=>bytes32[]) private disputeTranscripts;
    event TableOpened(bytes32 indexed id,address indexed owner,address key,uint128 amount,uint128 limit,uint64 expires);
    event TableSettled(bytes32 indexed id,uint64 indexed nonce,uint128 spent,uint128 payout,uint128 fee);
    event TableClosed(bytes32 indexed id);
    event TableCloseRequested(bytes32 indexed id,uint64 deadline);
    event TableDisputed(bytes32 indexed id,uint64 nonce,uint64 deadline,bytes32 entropy,bytes betSignature);
    event TableAnswered(bytes32 indexed id);
    constructor(IERC20 asset,address treasury,address dealer) EIP712("BonkersTable","1"){require(dealer!=address(0),"operator");operator=dealer;vault=new PlayerVault(asset,address(this),treasury);tableVerifier=new TableVerifier();}
    function openTable(address key,uint128 amount,uint128 limit,uint64 expires) external returns(bytes32 id){
        require(activeTables<10,"table capacity");require(key!=address(0)&&key!=msg.sender&&expires>block.timestamp&&expires<=block.timestamp+1 hours,"table permission");
        bytes32 prior=ownerTable[msg.sender];require(prior==bytes32(0)||tableState[prior].closed,"existing table");
        id=keccak256(abi.encode(address(this),msg.sender,++openings[msg.sender]));ownerTable[msg.sender]=id;
        Table storage t=tableState[id];t.owner=msg.sender;t.key=key;t.opened=uint64(block.timestamp);t.expires=expires;
        vault.openTable(id,msg.sender,amount,limit);activeTables++;emit TableOpened(id,msg.sender,key,amount,limit,expires);
    }
    function offerHash(TableTypes.Offer calldata o) public view returns(bytes32){return _hashTypedDataV4(keccak256(abi.encode(OFFER,o.tableId,o.nonce,o.validUntil,keccak256(abi.encode(o.seats,o.stakes)),keccak256(abi.encode(o.commitments)))));}
    function betHash(TableTypes.Offer calldata o,bytes32 entropy) public view returns(bytes32){return _hashTypedDataV4(keccak256(abi.encode(BET,offerHash(o),entropy)));}
    function _check(TableTypes.Offer calldata o,bytes32 entropy,bytes calldata betSignature) private view returns(bytes32 digest,uint128 initial){
        Table storage t=tableState[o.tableId];require(t.owner!=address(0)&&!t.closed&&o.nonce==t.nonce,"table nonce");
        require(o.validUntil>t.opened&&o.validUntil<=t.expires&&o.seats.length>0&&o.seats.length<=7&&o.seats.length==o.stakes.length&&o.stakes.length==o.commitments.length,"offer terms");
        uint256 mask;for(uint256 i;i<o.seats.length;i++){require(o.seats[i]<7&&(mask&(1<<o.seats[i]))==0&&o.stakes[i]>=1e6&&o.stakes[i]<=5e6&&o.stakes[i]%1e6==0&&o.commitments[i]!=bytes32(0),"seat terms");mask|=1<<o.seats[i];initial+=o.stakes[i];}
        (,uint128 balance,uint128 collateral,uint128 limit,)=vault.tables(o.tableId);require(initial<=limit&&balance>=initial+_fees(o)&&collateral>=uint256(initial)*15,"table capacity");
        require(SignatureChecker.isValidSignatureNow(operator,offerHash(o),o.signature),"dealer offer");digest=betHash(o,entropy);require(SignatureChecker.isValidSignatureNow(t.key,digest,betSignature),"player bet");
    }
    function _fees(TableTypes.Offer calldata o) private pure returns(uint128 fee){for(uint256 i;i<o.stakes.length;i++)fee+=uint128(uint256(o.stakes[i])*25/10000/10000*10000);}
    function _verify(TableTypes.Offer calldata o,bytes32 entropy,bytes32 digest,TableTypes.Proof[] calldata proofs,bool finish) private view returns(uint128 spent,uint128 paid,bytes32[] memory hashes){
        require(proofs.length==o.seats.length,"proof seats");hashes=new bytes32[](proofs.length);
        for(uint256 i;i<proofs.length;i++){
            require(keccak256(abi.encode(proofs[i].seed))==o.commitments[i],"seed commitment");
            bytes32 shuffled=keccak256(abi.encode(o.tableId,o.nonce,o.seats[i],entropy));
            (uint128 cost,uint128 payout,bytes32 transcript)=tableVerifier.verify(proofs[i],shuffled,o.stakes[i],digest,o.seats[i],tableState[o.tableId].key,operator,_domainSeparatorV4(),finish);
            spent+=cost;paid+=payout;hashes[i]=transcript;
        }
    }
    function settleTableRound(TableTypes.Offer calldata o,bytes32 entropy,bytes calldata betSignature,TableTypes.Proof[] calldata proofs) external {
        (bytes32 digest,)=_check(o,entropy,betSignature);(uint128 spent,uint128 paid,)=_verify(o,entropy,digest,proofs,false);_settle(o.tableId,spent,paid,_fees(o));
    }
    function _settle(bytes32 id,uint128 spent,uint128 paid,uint128 fee) private {
        Table storage t=tableState[id];vault.settleTable(id,spent,paid,fee);emit TableSettled(id,t.nonce++,spent,paid,fee);
        t.disputedOffer=0;t.disputeAt=0;t.answered=false;delete disputeSteps[id];delete disputeTranscripts[id];
    }
    function closeTableCooperative(bytes32 id,uint64 nonce,bytes calldata playerSignature,bytes calldata dealerSignature) external {
        Table storage t=tableState[id];require(!t.closed&&t.owner!=address(0)&&nonce==t.nonce&&t.disputedOffer==0,"close nonce");bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(CLOSE,id,nonce)));
        require((SignatureChecker.isValidSignatureNow(t.key,digest,playerSignature)||SignatureChecker.isValidSignatureNow(t.owner,digest,playerSignature))&&SignatureChecker.isValidSignatureNow(operator,digest,dealerSignature),"close signatures");_close(id);
    }
    function requestTableClose(bytes32 id) external {
        Table storage t=tableState[id];require((msg.sender==t.owner||block.timestamp>=t.expires)&&!t.closed&&t.closeAt==0,"close owner");t.closeAt=uint64(block.timestamp)+CHALLENGE_SECONDS;emit TableCloseRequested(id,t.closeAt);
    }
    function disputeTableRound(TableTypes.Offer calldata o,bytes32 entropy,bytes calldata betSignature) external {
        (,uint128 initial)=_check(o,entropy,betSignature);Table storage t=tableState[o.tableId];require(t.disputedOffer==0,"existing dispute");
        t.disputedOffer=offerHash(o);t.failureProfit=initial*15;t.disputeAt=uint64(block.timestamp)+CHALLENGE_SECONDS;
        if(t.closeAt!=0&&t.closeAt<t.disputeAt)t.closeAt=t.disputeAt;emit TableDisputed(o.tableId,o.nonce,t.disputeAt,entropy,betSignature);
    }
    function answerTableDispute(TableTypes.Offer calldata o,bytes32 entropy,bytes calldata betSignature,TableTypes.Proof[] calldata proofs) external {
        (bytes32 digest,)=_check(o,entropy,betSignature);Table storage t=tableState[o.tableId];require(t.disputedOffer==offerHash(o)&&block.timestamp<t.disputeAt,"dispute deadline");
        (uint128 spent,uint128 paid,bytes32[] memory hashes)=_verify(o,entropy,digest,proofs,true);
        if(!t.answered){disputeSteps[o.tableId]=new uint32[](proofs.length);disputeTranscripts[o.tableId]=new bytes32[](proofs.length);}
        for(uint256 i;i<proofs.length;i++){uint32 count=uint32(proofs[i].moves.length);require(count>=disputeSteps[o.tableId][i]&&(!t.answered||count!=disputeSteps[o.tableId][i]||hashes[i]==disputeTranscripts[o.tableId][i]),"older transcript");disputeSteps[o.tableId][i]=count;disputeTranscripts[o.tableId][i]=hashes[i];}
        t.spent=spent;t.payout=paid;t.fee=_fees(o);t.answered=true;emit TableAnswered(o.tableId);
    }
    function finalizeTableDispute(bytes32 id) public {
        Table storage t=tableState[id];require(!t.closed&&t.disputedOffer!=0&&block.timestamp>=t.disputeAt,"dispute pending");
        if(t.answered)_settle(id,t.spent,t.payout,t.fee);else _settle(id,0,t.failureProfit,0);
    }
    function claimTableClose(bytes32 id) external {
        Table storage t=tableState[id];require(!t.closed&&t.closeAt!=0&&block.timestamp>=t.closeAt,"close pending");if(t.disputedOffer!=0)finalizeTableDispute(id);_close(id);
    }
    function _close(bytes32 id) private {Table storage t=tableState[id];t.closed=true;activeTables--;vault.closeTable(id);emit TableClosed(id);}
    uint8 public constant coinRulesVersion=1;
    struct CoinRound {address player;bytes32 commitment;bytes32 entropy;uint128 stake;uint64 deadline;uint8 count;uint8 choice;uint8 phase;uint8 heads;uint128 payout;bool failure;}
    mapping(bytes32=>CoinRound) private coinRounds;
    event CoinOffered(bytes32 indexed id,address indexed player,bytes32 commitment,uint128 stake,uint8 count);
    event CoinJoined(bytes32 indexed id,bytes32 entropy,uint8 choice);
    event CoinFinished(bytes32 indexed id,bytes32 seed,uint8 heads,uint128 payout,bool push,bool failure);
    function coinExposure(bytes32 id) public view returns(bytes32){return keccak256(abi.encode(address(this),"TOIN_COSS",id));}
    function offerCoin(bytes32 id,bytes32 commitment,address player,uint128 stake,uint8 count) external onlyOperator {
        require(coinRounds[id].phase==0&&commitment!=bytes32(0)&&player!=address(0),"invalid coin offer");
        require((count==1||count==11||count==21)&&stake>=1e6&&stake<=5e6&&stake%10000==0,"coin terms");
        coinRounds[id]=CoinRound(player,commitment,bytes32(0),stake,uint64(block.timestamp+OPERATOR_SECONDS),count,0,1,0,0,false);
        emit CoinOffered(id,player,commitment,stake,count);
    }
    function joinCoin(bytes32 id,uint8 choice,bytes32 playerEntropy) external {
        CoinRound storage r=coinRounds[id];require(r.phase==1&&msg.sender==r.player&&block.timestamp<r.deadline&&choice<=1,"coin join");
        r.choice=choice;r.entropy=keccak256(abi.encode(address(this),block.chainid,id,playerEntropy));
        vault.lockCoin(coinExposure(id),r.player,r.stake);r.phase=2;r.deadline=uint64(block.timestamp+OPERATOR_SECONDS);
        emit CoinJoined(id,r.entropy,choice);
    }
    function coinHeads(bytes32 seed,bytes32 entropy,uint8 count) public pure returns(uint8 heads){
        require(count==1||count==11||count==21,"coin count");
        for(uint8 n=0;n<count;n++)if(uint256(keccak256(abi.encode(seed,entropy,n)))&1==0)heads++;
    }
    function settleCoin(bytes32 id,bytes32 seed) external {
        CoinRound storage r=coinRounds[id];require(r.phase==2&&block.timestamp<r.deadline&&keccak256(abi.encode(seed))==r.commitment,"coin reveal");
        r.heads=coinHeads(seed,r.entropy,r.count);bool push=uint256(r.heads)*2==r.count;
        bool win=(r.choice==0&&uint256(r.heads)*2>r.count)||(r.choice==1&&uint256(r.heads)*2<r.count);
        r.payout=push?r.stake:win?r.stake*2:0;r.phase=3;
        vault.settleCoin(coinExposure(id),r.payout,push);emit CoinFinished(id,seed,r.heads,r.payout,push,false);
    }
    function claimCoinFailure(bytes32 id) external {
        CoinRound storage r=coinRounds[id];require((r.phase==1||r.phase==2)&&block.timestamp>=r.deadline,"coin timeout");
        bool joined=r.phase==2;r.phase=3;r.failure=true;if(joined){r.payout=r.stake*2;vault.settleCoin(coinExposure(id),r.payout,true);}
        emit CoinFinished(id,bytes32(0),0,r.payout,false,true);
    }
    function coinState(bytes32 id) external view returns(CoinRound memory){return coinRounds[id];}


}
