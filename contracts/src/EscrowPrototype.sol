// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20Demo {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}
interface IBlackjackVerifier {
    // Must bind proof to ALL inputs, validate signed action order, shuffle, and exact payout.
    function verify(bytes32 roundId, address player, bytes32 commitment, uint256 stake, bytes calldata proof) external view returns (uint256 grossPayout);
}

/// @notice TESTNET RESEARCH ONLY. Not connected to the web demo and not production audited.
/// @dev Settlement requires an independent blackjack verifier. RejectingVerifier is the only
/// supplied non-test implementation; ordinary settlement is intentionally unavailable.
contract EscrowPrototype {
    struct Session { uint256 remaining; uint64 expires; }
    struct Round { address player; bytes32 commitment; uint256 stake; uint256 maxPayout; uint64 deadline; bool closed; bool accepted; }
    IERC20Demo public immutable token;
    IBlackjackVerifier public immutable verifier;
    address public immutable operator;
    uint256 public houseBalance;
    uint256 public reserved;
    uint256 public playerLiabilities;
    uint256 public lockedStakes;
    bool public paused;
    uint256 private entered;
    mapping(address => uint256) public available;
    mapping(address => mapping(address => Session)) public sessions;
    mapping(bytes32 => Round) public rounds;
    event Deposited(address indexed player, uint256 amount);
    event Withdrawn(address indexed player, uint256 amount);
    event WagerLocked(bytes32 indexed roundId, address indexed player, uint256 stake, uint256 maximum, bytes32 commitment, uint64 deadline);
    event Settled(bytes32 indexed roundId, uint256 grossPayout, bool timeout);
    event SessionAuthorized(address indexed player, address indexed signer, uint256 limit, uint64 expires);
    modifier nonReentrant() { require(entered == 0, "reentry"); entered = 1; _; entered = 0; }
    modifier onlyOperator() { require(msg.sender == operator, "operator only"); _; }
    constructor(IERC20Demo asset, IBlackjackVerifier settlementVerifier) {
        require(block.chainid == 31337 || block.chainid == 84532, "test chains only");
        require(address(asset).code.length > 0 && address(settlementVerifier).code.length > 0, "contracts required");
        token = asset; verifier = settlementVerifier; operator = msg.sender;
    }
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "zero deposit");
        uint256 beforeBalance = token.balanceOf(address(this));
        require(token.transferFrom(msg.sender, address(this), amount), "transfer failed");
        require(token.balanceOf(address(this)) - beforeBalance == amount, "unsupported token");
        available[msg.sender] += amount; playerLiabilities += amount;
        emit Deposited(msg.sender, amount);
    }
    function fundHouse(uint256 amount) external onlyOperator nonReentrant {
        uint256 beforeBalance = token.balanceOf(address(this));
        require(token.transferFrom(msg.sender, address(this), amount), "transfer failed");
        require(token.balanceOf(address(this)) - beforeBalance == amount, "unsupported token");
        houseBalance += amount;
    }
    function withdraw(uint256 amount) external nonReentrant {
        require(available[msg.sender] >= amount && amount > 0, "insufficient balance");
        available[msg.sender] -= amount; playerLiabilities -= amount;
        // No destination parameter: session keys cannot redirect a player's withdrawals.
        require(token.transfer(msg.sender, amount), "transfer failed");
        emit Withdrawn(msg.sender, amount);
    }
    function withdrawHouse(uint256 amount) external onlyOperator nonReentrant {
        require(amount <= houseBalance - reserved, "reserved for players");
        houseBalance -= amount; require(token.transfer(operator, amount), "transfer failed");
    }
    function authorizeSession(address signer, uint256 limit, uint64 expires) external {
        require(signer != address(0) && expires > block.timestamp && expires <= block.timestamp + 1 days, "invalid session");
        sessions[msg.sender][signer] = Session(limit, expires);
        emit SessionAuthorized(msg.sender, signer, limit, expires);
    }
    function revokeSession(address signer) external { delete sessions[msg.sender][signer]; }
    function setPaused(bool value) external onlyOperator { paused = value; }
    function publishOffer(bytes32 id, address player, bytes32 commitment, uint256 stake, uint256 maxPayout, uint64 deadline) external onlyOperator {
        require(!paused && rounds[id].player == address(0) && player != address(0), "invalid offer");
        require(commitment != bytes32(0) && stake > 0 && maxPayout >= stake && maxPayout <= stake * 16, "invalid terms");
        require(deadline > block.timestamp && deadline <= block.timestamp + 10 minutes, "invalid deadline");
        rounds[id] = Round(player, commitment, stake, maxPayout, deadline, false, false);
    }
    function lockWager(bytes32 id, address player, bytes32 commitment, uint256 stake, uint256 maxPayout, uint64 deadline) external nonReentrant {
        Round storage offer = rounds[id];
        require(!paused && offer.player == player && !offer.accepted && !offer.closed, "no open offer");
        require(offer.commitment == commitment && offer.stake == stake && offer.maxPayout == maxPayout && offer.deadline == deadline, "offer mismatch");
        require(commitment != bytes32(0) && stake > 0, "invalid wager");
        require(deadline > block.timestamp && deadline <= block.timestamp + 10 minutes, "invalid deadline");
        require(maxPayout >= stake && maxPayout <= stake * 16, "invalid maximum");
        if (msg.sender != player) {
            Session storage permission = sessions[player][msg.sender];
            require(permission.expires > block.timestamp && permission.remaining >= stake, "unauthorized session");
            permission.remaining -= stake;
        }
        require(available[player] >= stake, "insufficient balance");
        require(houseBalance - reserved >= maxPayout - stake, "insufficient house reserve");
        available[player] -= stake; playerLiabilities -= stake; lockedStakes += stake;
        reserved += maxPayout - stake;
        offer.accepted = true;
        emit WagerLocked(id, player, stake, maxPayout, commitment, deadline);
    }
    function settle(bytes32 id, bytes calldata proof) external nonReentrant {
        Round storage r = rounds[id];
        require(r.player != address(0) && r.accepted && !r.closed, "unknown or settled");
        require(block.timestamp < r.deadline, "deadline elapsed");
        uint256 payout = verifier.verify(id, r.player, r.commitment, r.stake, proof);
        require(payout <= r.maxPayout, "payout exceeds reserve");
        close(r, id, payout, false);
    }
    function claimTimeout(bytes32 id) external nonReentrant {
        Round storage r = rounds[id];
        require(r.player != address(0) && r.accepted && !r.closed && block.timestamp >= r.deadline, "not claimable");
        close(r, id, r.maxPayout, true);
    }
    function close(Round storage r, bytes32 id, uint256 payout, bool timedOut) private {
        r.closed = true; reserved -= r.maxPayout - r.stake; lockedStakes -= r.stake;
        houseBalance += r.stake; houseBalance -= payout;
        available[r.player] += payout; playerLiabilities += payout;
        emit Settled(id, payout, timedOut);
    }
    function accountedAssets() external view returns (uint256) { return houseBalance + playerLiabilities + lockedStakes; }
}

/// @notice Prevents an escrow prototype from pretending that arbitrary server results are verified.
contract RejectingVerifier is IBlackjackVerifier {
    function verify(bytes32, address, bytes32, uint256, bytes calldata) external pure returns (uint256) {
        revert("blackjack proof verifier not implemented");
    }
}
