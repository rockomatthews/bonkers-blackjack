# Escrow research prototype — NOT a blackjack settlement system

This folder is an isolated, unaudited testnet-only escrow experiment. It is **not connected to the website** and has not been deployed. Constructors permit only local chain 31337 and Base Sepolia 84532. Never use real tokens or real house funds.

Implemented and tested: token funding, separate house/player accounting, bounded session keys, operator-published wager offers, funded maximum-payout reservations, locked wagers, nonce-like round ID reuse prevention, direct player withdrawals, house withdrawal reserve protection, pause of new wagers without blocking exits, exact-maximum timeout recovery, and settlement behind an immutable verifier interface.

**The blackjack verifier is not implemented.** `RejectingVerifier` rejects all settlement proofs. `MockVerifier` exists only in the test file and returns a supplied number; it proves escrow bookkeeping, not game fairness. Neither is a production verifier. The test suite's gas figures exclude real blackjack proof validation.

The full protocol still needs signed-action validation, shuffle/dealing validation, proof of legal choices and funds for splits/doubles, transcript availability, secure timing, shared-table semantics, and operator/player fault rules. P-256 browser demo actions are not wired to these EVM sessions. Single-wager escrow is a research boundary, not a completed implementation of the planned multi-seat contract.

Run `npm run contracts:test` with Foundry installed. Tests include replay rejection, excess payouts, insufficient reserves, expired/revoked session keys, withdrawals, pause/timeouts, mainnet rejection, and randomized payout conservation.
