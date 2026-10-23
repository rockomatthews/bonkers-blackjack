# Shared minute Toin Coss

## Behaviour

A public round is identified by its UTC minute start (`floor(timestamp / 60)`). Betting is open during seconds 0–49 and closes exactly at second 50. The coin animates during the last 10 seconds. Its actual result is the parity of the SHA-256 hash of the fixed evmnet BLS signature whose release is at or after the minute boundary (0–2 seconds after it). If the beacon is delayed, the UI keeps the result pending instead of inventing a side. Every visitor uses the same round ID and verified signature.

The single bet covers the current minute's upcoming result. Majority bets cover the next **11 or 21 public minute results**, including that upcoming result; these preserve the user's earlier odd-batch choice and cannot tie. They are not personal simulated batches and do not use already-known history. Past outcomes are not predictive. Public history starts when the shared sequence is first launched, persists its start in the database, and shows the latest 30 independently verified minute beacons.

## On-chain funds and activation

`GlobalCoinGame` deploys an immutable `PlayerVault` and the pinned Randamu evmnet verifier. The existing Blackjack vault accepts only its immutable original game, so it cannot be reused by this new contract. No existing house or player funds are migrated automatically. The homepage and new cashier disclose the separate game balances.

The house wallet opens `/toin-coss`, signs in, then:

1. **Create shared flip contract** and confirm its deployment in the wallet. The server verifies exact constructor bytecode, token, treasury, successful receipt, and resulting vault address.
2. **Fund shared flip reserve** using native Base USDC. At least 75 USDC is required by the vault's existing Base funding rule.
3. **Activate funded shared flips**, confirming unpause. Only the configured house wallet can register or activate the contract. Pausing stops new bets and deposits; player withdrawals remain available. Funding never withdraws or reassigns existing player money.

Each accepted 1–5 USDC wager immediately locks its stake plus the disclosed 0.25% fee (floored to cents), and one matching stake of house liability. Capacity is enforced on-chain, not only in the UI. At most 200 wagers may be pending. Winners receive twice the stake; losers receive zero. The operator cannot choose outcomes, move a player's available balance, or settle an unproven result. All proof publication, completed-batch settlement, and missing-result recovery are permissionless.

If any required result remains unpublished 24 hours after the batch's final minute boundary, anyone can trigger the contract's refund of stake and fee to the original player's available balance. A fully proven losing sequence cannot be refunded. The current protocol remains unaudited; tests and the Venice review are not a security audit.

A one-minute authenticated maintenance cron discovers direct on-chain wagers, verifies future-beacon signatures, publishes up to four missing minute proofs per transaction, and settles up to 100 eligible wagers per transaction. Read-only batch getters avoid per-player/per-flip RPC loops; submission shares the dealer's transaction lock. Pending IDs are preserved across concurrent maintenance snapshots. The UI can also request a settlement check. If the dealer has no gas or the oracle is unavailable, funds stay locked/recoverable; the app never fabricates a paid result.

## Randomness provenance

- Official drand client: `drand-client@1.4.2`, verification explicitly enabled.
- Network: evmnet; chain hash `04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3`, genesis `1727521075`, period 3 seconds; public key pinned in server and immutable verifier.
- Verifier: https://github.com/randa-mu/bls-solidity at `11af179a8287d978659aae07adb66aa60f64b8a6`, MIT licence retained under `contracts/src/vendor/drand`.
- Network reference: https://drand.love/developer ; signature verification reference: https://github.com/drand/drand-client .

The minute-to-beacon mapping cannot be switched by the caller or operator. An unavailable fixed beacon is not replaced by a different one: substitution would allow result selection. Venice's review highlighted delayed randomness and key pinning; both are covered by the pending/refund path and genuine-signature fixtures verified against the actual evmnet key. The default drand network key is not the evmnet key.

## Chat

The right panel opens by default, with General on the homepage, Blackjack on rooms/tables/practice, and Toin Coss on the coin game. Minimize/reopen preference persists locally. Desktop tables shrink to leave a separate chat column; smaller screens use a minimizable drawer.

Reading is public. Posting uses the selected wallet's verified HttpOnly session and same-origin POST checks. The server chooses the author, limits posts to 500 characters and one per 3 seconds per room, retains 100 messages per room, and renders text without HTML. Wallet identity changes invalidate in-flight chat identity reads. Chat uses separate private database rows/pool and never locks the financial dealer row. Read polls do not rewrite chat state. `database/community.sql` records the applied server-only schema: RLS enabled, no browser-role grants or policies; posting goes through Next's authenticated handler.

## Verification

- `npm test`: includes cutoff, fixed future beacon mapping, genuine BLS verification, invalid proofs, chat isolation/text bounds/rate limits.
- `forge test --root contracts`: includes real single/11/21-minute proofs, solvency, exact cutoff, invalid signatures, replay, refund windows and withdrawal protections.
- `BONKERS_E2E_RPC_PORT=18619 BONKERS_GLOBAL_COIN_TEST=1 npx playwright test --config playwright.crypto.config.ts tests/crypto-browser/live-wallet.spec.ts -g 'global coin funds|community chat'`: disposable Anvil starts at a signed historical fixture epoch; browser clock/feed timing is controlled for the cutoff test, while USDC escrow and settlement use actual contract execution and actual verified drand signatures. No production money is used.
- Existing Blackjack seven-seat, missing-key restoration, close/home navigation, idle logout, and wallet-isolation browser regressions remain checked separately.

Old personal toss creation is retired (HTTP 410). `/toin-coss/previous` retains history and existing-round recovery; it does not place new private wagers.
