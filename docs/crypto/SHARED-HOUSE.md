# Shared house and independent wallets — 2026-10-16

This supersedes the same-wallet pilot described in LIVE-WALLET-ENTRANCE.md.

## Ownership and funding

The house administrator is pinned to `0xe8e3587b47253051Aed6e02430cdE5B1c1664B6B`, as supplied by the owner. Only The Bonkers Room is open. Midnight Lounge and Carnival Club are non-interactive Coming soon cards; direct URLs show a Coming soon page without a game or cashier. The first room uses the registered shared game/vault. A player never deploys a game or funds the house. Player USDC is credited to that player's address. Withdrawals are signed by the player and return funds to that wallet; pausing deposits never prevents available-balance withdrawals.

The owner explicitly approved a separate dealer credential. Its public address is `0x2FbDB1d95F5926F4B3607bF395bf7c18F5369eA6`. It is stored in macOS Keychain (`ai.bonkers-blackjack.dealer.production`) and as an encrypted Vercel production secret (`BONKERS_DEALER_KEY`). No key is committed, printed, passed as a command argument, or put in browser code. It has no treasury/player withdrawal permission. It can spend its funded ETH gas and operate the game; a compromised dealer remains a game-integrity risk. Keep its gas balance limited. Rotation requires completing/recovering open rounds and a new immutable game deployment; do not silently replace the key while funds/round secrets depend on it.

House setup at `/house`:

1. Select **Base / Coinbase Wallet**, connect the configured house address, and sign the site-bound login message (not a transaction).
2. **Create shared house table**. The connected house wallet deploys the reviewed-in-source artifact with itself as treasury and the restricted server account as dealer. Registration verifies the exact creation transaction and arguments. The registry cannot be replaced by another wallet or another game.
3. **Fund house reserve** with at least 75 native USDC on Base. Funding leaves deposits paused. A top-up through these controls closes deposits first.
4. **Fund dealer gas · 0.0002 ETH**, a separate wallet-confirmed transfer. Network/deployment/player transaction fees also require Base ETH in the signing wallet.
5. Only when the owner decides the house is funded, press **House funded — open deposits** and confirm the treasury-only contract transaction. Nothing in deployment, funding, a server restart, or an environment switch unpauses automatically.
6. A different wallet can now connect, approve a chosen amount, deposit, play a 5-USDC initial wager, and withdraw its own funds. The house can close deposits at any time. Withdrawing house funds closes deposits first and cannot take player balances or collateral reserved for active hands.

New contracts enforce 75 USDC free collateral for Base deposits and opening, while enforcing the same original reserved-collateral accounting. A capacity shortfall closes new deposits/play in the UI. Existing immutable deployments are not modified by publishing this code. Do not send USDC directly to the house address/vault expecting player credit: the deposit button calls `depositFor` after exact approval.

## Capacity and the 75-USDC minimum

The minimum is collateral for ONE active initial 5-USDC hand, not funding for seven people. The vault reserves a maximum gross return of 16 × 5 = 80 USDC (including its failure recovery); the player contributes 5 and the house backs the remaining 75. Seven simultaneous initial hands therefore need at least 525 USDC house collateral before a buffer for losses. Wins paid to players reduce future capacity, and a 75-USDC house may need a top-up after the first player win.

The live flow currently gives each wallet an independent assigned round. It does not implement seven players sharing one dealer hand, a seven-seat admission limit, a waiting list, or automatic table creation for an eighth player. New wagers fail closed when there is insufficient unreserved collateral. The seven-chair artwork must not be presented as proof of shared seating or queue behavior.

## Wallet connection

EIP-6963 provider discovery binds every RPC request to the wallet explicitly selected by the user. The Base / Coinbase Wallet option is shown even when not installed (disabled with installation guidance). Legacy Coinbase injection and multi-provider arrays are supported. A Phantom `window.ethereum` default cannot override an independently selected Base provider. Switching accounts/chains clears the player state and requires reconnection. The selected provider is checked before financial writes.

CoinPoker's public [cashier guide](https://coinpoker.com/deposits-and-withdrawals/cryptocurrency/) and [withdrawal guide](https://coinpoker.com/help/withdraw-to-personal-wallet/) informed the separate deposit/withdraw sections, explicit currency/network and destination, and transaction confirmation. Bonkers accepts only native Base USDC in this release. It does not copy CoinPoker's exchange-deposit addresses, supported-coin claims, custodial crediting or wagering restrictions.

## Dealer, persistence, authentication and recovery

- Dealer nonce writes serialize through a private Postgres state row. The isolated `bonkers_dealer` schema holds configuration and encrypted shuffle seeds, never a replacement financial ledger. USDC accounting remains on-chain. The existing Bonkers database is used; anon/authenticated have no schema/table access, and RLS is enabled. No new public Data API access is granted.
- A random shuffle seed and commitment are persisted with AES-256-GCM encryption **before** the first chain transaction. Browser responses expose only redacted state until the round finishes. Log scans start at the round's saved block.
- Login uses a two-minute single-use nonce and an origin/address-bound message. The session is a one-hour HttpOnly, SameSite=Strict cookie (Secure on HTTPS). Every mutation requires the fixed configured site origin, never an untrusted Host header. The production default is `https://bonkers-blackjack.vercel.app`. Alternate domains must set `BONKERS_SITE_ORIGIN` explicitly.
- Only an authenticated house wallet can register the one shared deployment, verified against exact creation bytecode and arguments. New `offerFor` rounds restrict joining to the assigned player, preventing a third party from joining an exposed offer and forcing house fault payouts.
- The server handles offer, start, observe and settlement; players sign their own joins/actions. Authenticated browser requests advance the dealer during active play; it does not require the owner's browser to stay open. No permanently running worker or fake shared private key is installed in clients. If nobody returns to an abandoned round, on-chain timers permit `autoStand` / collateralized `claimFailure` recovery when a player returns. Withdrawals of unlocked balances remain direct wallet transactions even if dealer authentication expires.
- Contracts remain unaudited and retain the existing 5-USDC Base initial-wager cap. This delivery is a functional wallet test path, not an assertion of audit/licensing/market release readiness. Existing independent production-readiness checks remain closed.

The local preview does not load production secrets or create a second house registry. It links to the hosted shared-house cashier for financial actions. An attempted full production-env injection was blocked by automatic review and was not performed. Disposable browser tests explicitly opt into an isolated local file store and local Anvil RPC; no such test configuration is used on the hosted site.

## Verification

- 65 application tests passed, including fixed-origin rejection, pinned house/default closed, EIP-6963 Base discovery over Phantom and all prior rules regressions.
- 39 Solidity tests passed, including assigned-player protection, separate wallet exits, reserve accounting, and funding-not-opening deposits.
- Production build and browser tests use disposable Anvil chain 8453 with mock USDC. `docs/crypto/evidence/shared-house-local.json` records zero mainnet transactions. A separate house and player executed deployment, funding while closed, explicit opening, player deposit, game settlement, independent receipt replay, 0.01-USDC house fee and withdrawal while paused. Screenshots cover desktop, phone portrait and landscape. No browser runtime errors occurred.
- Supabase migration was applied and read back: RLS enabled, anon schema usage false, anon/authenticated table SELECT false.
- Venice reviewed the architecture and corrections. Its output was supplemental; test/source evidence determines acceptance.

Actual house deployment/funding/opening and real-player settlement require the owner's/player's wallet confirmations. Publishing the site or installing a zero-balance dealer key is not evidence that any of those transactions happened.
