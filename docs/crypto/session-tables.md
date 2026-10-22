# Session blackjack tables

This release reduces waits in the existing game and adds a separately activated session protocol. Publishing the website does not replace the deployed immutable contracts or move any funds.

## Existing tables

Dealer progress advances up to three protocol steps per request. Balance reads run separately from card updates and are throttled during polling. Transaction preparation estimates gas without a redundant simulation. Pending signed transactions retain their exact bytes and hash for retry.

## New tables

The player chooses an amount to bring from their available vault balance. Opening a table locks that amount and reserves house collateral of fifteen times the permitted total initial wager. The signing key exists only in the current browser tab and receives no ETH. It cannot withdraw funds to another address.

The dealer signs a seed commitment and exact seat/wager layout before the player supplies entropy. Every decision binds the game, chain, table, round nonce, seat, action index and previous observation. The dealer acknowledges accepted decisions. The browser verifies signed observations and, when seeds are revealed, replays every hand. Deal and decisions use HTTP and local signatures rather than wallet transactions or browser blockchain reads. One on-chain transaction verifies and settles all completed seats in a layout.

Winnings remain in the table balance. Leave returns the remaining balance to the owner's available vault balance; withdrawal is a separate wallet transaction. Rebet restores the previous layout; completed wagers are cleared. Fifteen minutes without activity stops further betting and attempts to finish and close the table. On-chain key expiry is an additional upper bound, not the inactivity timer.

## Recovery and limitations

Normal cooperative close follows settlement. If the tab key is lost, the owner may co-sign a settled close with the dealer. Otherwise the owner can request a close and initiate a dispute; after expiry anyone can request closure. Exceptional recovery uses a 24-hour challenge period. The signed offer, entropy, bet signature and acknowledged action prefix form the recovery receipt. A longer acknowledged prefix can challenge a shorter one. Recovery with seeds stands unfinished hands and declines insurance. If the operator does not supply seeds, the reserved maximum failure payout applies.

This is an unaudited candidate protocol. It proves deterministic replay, not that the operator cannot know future cards. A dealer can withhold acknowledgements and force automatic-Stand recovery; this is a fairness limitation. An interactive on-chain continuation would be stronger. Browser-only inactivity closure depends on a running tab; the server monitor also detects abandoned unfinished hands. Server downtime can delay recovery. Keep the downloadable receipt and use the contract directly if the website is unavailable. Reloading discards the in-memory key.

The authenticated maintenance route runs every five minutes. Its encrypted production CRON_SECRET is required for activation. It answers disputes, detects abandoned hands, retries settlement and processes matured recovery. Directly submitted on-chain disputes include the signed bet and entropy so the monitor can reconstruct them even if the browser never posted the bet. Production cron delivery still needs observation after a real activation.

## House activation

1. Sign in with the configured house wallet and open House controls.
2. Choose Create session contracts. Review the wallet deployment transaction. The server checks the exact compiled creation code, constructor and receipt before registering it.
3. Fund the prepared vault through Fund prepared vault, using native USDC on Base. At least 75 USDC is required for activation; actual admission remains collateral limited. Funding is separate from player deposits.
4. Close deposits on the current vault and finish outstanding blackjack and coin rounds.
5. Choose Activate funded session tables. The server checks the monitor configuration, old pending games and the new reserve. The new vault's player deposit gate remains paused until the house explicitly opens it.
6. Old player balances remain in the old vault. Each owner can use Previous vault balances in the cashier to withdraw to their own connected wallet, then deposit into the active vault. The house cannot migrate player balances for them.

Do not transfer USDC directly to a vault address: use its funding/deposit methods so accounting records the transfer. No production wallet transaction or house activation was performed during automated validation.

## Validation

The isolated Anvil/browser test migrates from an old vault, withdraws the old player's balance, opens a new table, plays seven independent seats and checks one settlement event and nonce increment. It blocks every browser blockchain RPC during Deal and decisions, checks zero additional owner-wallet transactions, retries a lost action response, verifies final proofs and checks token/vault accounting. It also submits a dispute without posting the bet to the API and verifies monitor recovery without duplicate gas writes. Solidity tests cover forged signatures, replay, collateral, insurance, splitting, doubling, surrender, owner close, expiry and dispute-prefix challenges. These tests do not constitute an external security audit or a funded mainnet playthrough.
