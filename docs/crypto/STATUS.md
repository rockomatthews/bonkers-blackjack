# Implementation checkpoint — October 1, 2026

Branch: `codex/crypto-private`. Public `main` remains untouched. **Private crypto testing is implemented; public production is not ready.** No real Base deployment or transaction was performed by the agent.

## Ready to exercise

- `/crypto-lab`: connected-wallet USDC approval, deposit, available balance, wagers/actions, verified settlement, withdrawal and receipt download on a local Base mainnet fork. A persistent dealer worker derives state from the seed and on-chain actions. There is no simulated database balance credit: test balances live in the local fork's actual contracts.
- `/crypto-pilot`: wallet-signed deployment/funding/play/withdrawal for an **owner-only Base mainnet test**. Mainnet contract code restricts play to the deploying owner and a maximum initial wager of 5 USDC. The intended wallet is `0x8A0182c099A618583e9EF98716DAcF739b3BD944`. This screen was verified on a separate local fork with chain ID 8453, not on live Base.
- Solidity verifier candidate replays six-deck shuffle, seven seats, ordered observations/actions, splits, doubles, natural payouts and added stakes. The game enforces seed commitments, stale-observation protection, player auto-stand and collateralized operator timeout.
- Independent TypeScript replay and downloadable receipts; 40 seven-seat rounds matched Solidity payouts, including 29 splits and 143 doubles.
- Wallet approvals use explicit amounts. Funds stay segregated in the vault. Mainnet test includes recovery of all unlocked player/house funds back to the owner wallet.

Both pages require local enablement and always return 404 on Vercel. Branch automatic deployment remains disabled. The current lab is http://127.0.0.1:3107/crypto-lab; the owner test is http://127.0.0.1:3107/crypto-pilot. Open in a browser with the wallet extension.

## Verification evidence

- 45 Node tests passed.
- 24 Foundry tests passed, including fuzzing, seven seats, altered observations, illegal/stale actions, owner-only mainnet restriction and failure recovery.
- Browser local flow: 100 USDC deposit, 5 USDC wager, verified settlement, 10 USDC withdrawal; contract assets equaled accounted assets.
- Browser owner-pilot flow: deploy, fund, play, settle, withdraw player and house funds. Starting and ending USDC were identical because the same owner played both roles. Test execution was localhost Anvil only.
- Solidity and TypeScript payout comparison passed for 309 hands across 40 rounds.
- TypeScript/build checks and artifact equality are part of the final branch verification.
- Screenshots and JSON under `docs/crypto/evidence/`; no private keys or unrevealed seeds are included.

## Current real-mainnet prerequisite

Owner authorized testing without a specified maximum budget; the UI proposes a small initial allocation instead. On October 1, read-only Base RPC queries returned **zero ETH and zero native USDC** for the supplied wallet. Initial pilot funding is **85.01 USDC** (75 house reserve + 10.01 player balance) plus ETH for gas. The owner must fund the wallet and confirm transactions through their wallet extension. The agent has not imported keys or broadcast mainnet transactions.

## Remaining before public production

- Independent contract/protocol and game-math audit. `REVIEW.md` is internal engineering review only.
- Production dealer separation, sponsored and bounded sessions, robust persistent jobs/indexer/reorg/failover/reconciliation, seven-browser crypto acceptance, operational deployment and monitoring.
- Eligibility rules supplied by the licensing workstream and validated in the launch configuration.
- Multi-asset conversion provider approval/integration. User changed the entry flow to connected wallet; direct USDC testing does not require Privy or a conversion provider. Prior quote adapter remains disabled and unapproved.
- Separate crypto database schema is still unapplied. No public Supabase schema was changed. The local worker uses ignored private files and chain events, not production database infrastructure.

Read `TESTING.md` for start/test/recovery commands. A merge alone must not turn this private pilot into public real-money play.

## Later October 1 update — any wallet

The owner requested removal of the wallet whitelist and public-site testing. The address restriction is now removed from both test UIs and new game-contract deployments. Each wallet's self-test deployment is stored separately. Previous owner-only browser records remain recoverable by their owner so existing funds are not hidden. Existing deployed immutable contracts retain their old restrictions; changing source does not upgrade them.

The local fork browser test completed with a DIFFERENT wallet: deploy, fund, play, settle, and withdraw. Foundry also verifies a second player can join a mainnet-mode game and can withdraw only its own funds. House withdrawals remain treasury-only.

Public navigation/cashier links and route enablement are prepared behind `CRYPTO_PUBLIC_TESTING=1`. That flag has NOT been enabled and these changes have NOT been merged/deployed to the public site. The owner's earlier requirement to wait for the issued license remains unresolved; a question asking whether it has arrived and what jurisdictions it permits is pending. The current per-wallet self-test is still not a shared production dealer service. Earlier owner-only descriptions in this checkpoint describe the previous revision, not new deployments.
