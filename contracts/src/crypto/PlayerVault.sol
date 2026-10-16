// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Private development vault. NOT audited or authorized for production funds.
/// @dev The immutable game must be independently reviewed. No admin can modify player balances.
contract PlayerVault is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable game;
    address public immutable treasury;
    uint256 public house;
    uint256 public reserved;
    uint256 public playerAvailable;
    uint256 public playerLocked;
    uint256 public feeRevenue;
    bool public paused = true;
    mapping(address=>uint256) public available;
    mapping(address=>uint256) public withdrawalNonces;
    mapping(bytes32=>Exposure) public exposures;
    mapping(bytes32=>bool) public coinWagers;
    struct Exposure { address player; uint128 initial; uint128 locked; uint128 maximum; uint128 fee; bool closed; }
    bytes32 public constant WITHDRAW_TYPEHASH=keccak256("Withdrawal(address owner,address recipient,uint256 amount,uint256 nonce,uint256 deadline)");
    event Deposited(address indexed owner,uint256 amount);
    event Withdrawn(address indexed owner,address indexed recipient,uint256 amount,uint256 nonce);
    event HouseFunded(uint256 amount);
    event WagerLocked(bytes32 indexed id,address indexed owner,uint256 amount,uint256 fee,uint256 maximum);
    event StakeAdded(bytes32 indexed id,uint256 amount);
    event Settled(bytes32 indexed id,address indexed owner,uint256 payout,bool operatorFailure);
    event Paused(bool value);
    modifier onlyGame(){require(msg.sender==game,"game only");_;}
    modifier onlyTreasury(){require(msg.sender==treasury,"treasury only");_;}
    constructor(IERC20 asset,address gameContract,address treasuryAddress) EIP712("BonkersPlayerVault","1") {
        require(address(asset).code.length>0 && gameContract!=address(0) && treasuryAddress!=address(0),"invalid configuration");
        token=asset;game=gameContract;treasury=treasuryAddress;
    }
    // Any caller may sponsor the gas. Funds are always pulled from and credited to the SAME owner.
    function depositFor(address owner,uint256 amount) external nonReentrant {
        require(!paused && owner!=address(0) && amount>0,"deposits closed");
        require(block.chainid!=8453||house-reserved>=75e6,"house reserve unavailable");
        uint256 beforeBalance=token.balanceOf(address(this));
        token.safeTransferFrom(owner,address(this),amount);
        require(token.balanceOf(address(this))-beforeBalance==amount,"unsupported token");
        available[owner]+=amount;playerAvailable+=amount;emit Deposited(owner,amount);
    }
    function withdraw(uint256 amount,address recipient) external nonReentrant {
        _withdraw(msg.sender,recipient,amount,withdrawalNonces[msg.sender]++);
    }
    function withdrawSigned(address owner,address recipient,uint256 amount,uint256 nonce,uint256 deadline,bytes calldata signature) external nonReentrant {
        require(block.timestamp<=deadline && nonce==withdrawalNonces[owner],"expired or replayed");
        bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(WITHDRAW_TYPEHASH,owner,recipient,amount,nonce,deadline)));
        require(SignatureChecker.isValidSignatureNow(owner,digest,signature),"owner signature required");
        withdrawalNonces[owner]++;
        _withdraw(owner,recipient,amount,nonce);
    }
    function _withdraw(address owner,address recipient,uint256 amount,uint256 nonce) private {
        require(recipient!=address(0) && amount>0 && available[owner]>=amount,"invalid withdrawal");
        available[owner]-=amount;playerAvailable-=amount;
        token.safeTransfer(recipient,amount);emit Withdrawn(owner,recipient,amount,nonce);
    }
    function fundHouse(uint256 amount) external nonReentrant {
        require(amount>0,"zero amount");uint256 beforeBalance=token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender,address(this),amount);
        require(token.balanceOf(address(this))-beforeBalance==amount,"unsupported token");
        house+=amount;emit HouseFunded(amount);
    }
    function withdrawProfit(uint256 amount) external onlyTreasury nonReentrant {
        require(amount<=house-reserved,"reserved collateral");house-=amount;token.safeTransfer(treasury,amount);
    }
    function setPaused(bool value) external onlyTreasury {require(value||block.chainid!=8453||house-reserved>=75e6,"fund house first");paused=value;emit Paused(value);}
    function lock(bytes32 id,address owner,uint128 stake) external onlyGame {
        require(!paused && exposures[id].player==address(0) && owner!=address(0),"invalid wager");
        require(stake>=1e6 && stake%1e6==0 && stake<=1_000_000e6,"invalid stake");
        uint128 fee=uint128(uint256(stake)*25/10_000/10_000*10_000);
        uint128 maximum=stake*16; // Four split hands, each doubled, gross return at 2:1.
        require(available[owner]>=uint256(stake)+fee && house-reserved>=maximum-stake,"insufficient funds");
        available[owner]-=uint256(stake)+fee;playerAvailable-=uint256(stake)+fee;
        house+=fee;feeRevenue+=fee;reserved+=maximum-stake+fee;playerLocked+=stake;
        exposures[id]=Exposure(owner,stake,stake,maximum,fee,false);
        emit WagerLocked(id,owner,stake,fee,maximum);
    }
    function lockCoin(bytes32 id,address owner,uint128 stake) external onlyGame {
        require(!paused&&exposures[id].player==address(0)&&owner!=address(0),"invalid coin wager");
        require(stake>=1e6&&stake<=5e6&&stake%10000==0,"coin stake 1-5 USDC cents");
        uint128 fee=uint128(uint256(stake)*25/10_000/10_000*10_000);
        require(available[owner]>=uint256(stake)+fee&&house-reserved>=stake,"insufficient funds");
        available[owner]-=uint256(stake)+fee;playerAvailable-=uint256(stake)+fee;
        house+=fee;feeRevenue+=fee;reserved+=uint256(stake)+fee;playerLocked+=stake;
        exposures[id]=Exposure(owner,stake,stake,stake*2,fee,false);coinWagers[id]=true;
        emit WagerLocked(id,owner,stake,fee,stake*2);
    }
    function settleCoin(bytes32 id,uint128 payout,bool refundFee) external onlyGame {
        Exposure storage e=exposures[id];require(coinWagers[id]&&!e.closed&&payout<=e.maximum,"invalid coin settlement");
        require(!refundFee||payout==e.initial||payout==e.maximum,"invalid fee refund");
        e.closed=true;reserved-=uint256(e.initial)+e.fee;playerLocked-=e.initial;
        house+=e.initial;house-=payout;available[e.player]+=payout;playerAvailable+=payout;
        if(refundFee){house-=e.fee;feeRevenue-=e.fee;available[e.player]+=e.fee;playerAvailable+=e.fee;}
        emit Settled(id,e.player,payout,false);
    }
    function addStake(bytes32 id,uint128 amount) external onlyGame {
        Exposure storage e=exposures[id];require(!coinWagers[id]&&e.player!=address(0)&&!e.closed&&amount>0,"invalid exposure");
        // Four doubled hands plus a locked half-wager insurance premium.
        require(e.locked+amount<=e.initial*17/2 && available[e.player]>=amount,"stake limit");
        available[e.player]-=amount;playerAvailable-=amount;playerLocked+=amount;
        e.locked+=amount;reserved-=amount;emit StakeAdded(id,amount);
    }
    // Game may call only after independently validated settlement or its enforced fault deadline.
    function settle(bytes32 id,uint128 payout,bool operatorFailure) external onlyGame {
        Exposure storage e=exposures[id];require(!coinWagers[id]&&e.player!=address(0)&&!e.closed,"already settled");
        require(operatorFailure?payout==e.maximum:payout<=e.maximum,"invalid payout");
        e.closed=true;reserved-=e.maximum-e.locked+e.fee;playerLocked-=e.locked;
        house+=e.locked;house-=payout;available[e.player]+=payout;playerAvailable+=payout;
        // No service fee is retained on an operator-failure recovery.
        if(operatorFailure){house-=e.fee;feeRevenue-=e.fee;available[e.player]+=e.fee;playerAvailable+=e.fee;}
        emit Settled(id,e.player,payout,operatorFailure);
    }
    function accountedAssets() external view returns(uint256){return house+playerAvailable+playerLocked;}
}
