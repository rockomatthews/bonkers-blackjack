# Engineering review — October 1, 2026

This is an internal implementation review, **not an independent security audit**. No audit provider has been engaged or approved by this work.

## Checked in code/tests

- Vault has immutable game authorization, owner-only withdrawals, withdrawal nonce/domain binding, separate player liabilities and house reserves, and collateral for four doubled split hands.
- Game commitment precedes participant entropy; actual card observations are committed before actions. Final settlement replays the shuffle, ordered actions, added stakes and payouts. Altered observations or unsupported payouts revert.
- A player cannot choose a move outside the posted hand's legal-move mask to intentionally break replay and claim the operator-failure payout. Additional stakes are owner transactions; stale observation hashes are rejected.
- Operator timeout is separate from player timeout. Player timeout stands; operator failure pays reserved maximum and refunds the fee. Pausing deposits does not block owner exits.
- Mainnet candidate is owner-only, 5 USDC maximum wager. Both test pages are locally gated and disabled on Vercel. No mainnet signer or key is held by the server.
- Browser tests exercised allowance, deposit, receipt-confirmed credit, wager lock, replay settlement, withdrawal, and conservation against Base USDC on a local fork.
- The mainnet UI was tested against a separate localhost fork using chain ID 8453. Owner player/house funds returned exactly to the starting token balance. This is not live mainnet evidence.

## Deliberate limitations / audit scope

- Operator sees future cards; the protocol verifies its adherence, not operator blindness. It can choose whether to start/reveal and must pay the specified failure compensation when it does not.
- Shuffle uses Keccak Fisher–Yates with modulo reduction (negligible modulo bias, not a claim of mathematically exact uniform sampling). Independent game-math review must assess the complete protocol.
- No production session-key relay, seven-user browser acceptance test, hardware-wallet matrix, RPC failover, deep-reorg recovery, rate limiting, eligibility integration, or Supabase production job/indexer deployment is completed by this increment.
- Local worker uses private disk files plus chain events. It is not a Vercel serverless worker or a production HA implementation. Receipt recovery after an ambiguous settlement confirmation remains an operations item; on-chain funds do not depend on the JSON receipt.
- The owner test combines dealer and player in one wallet/browser and intentionally cannot validate operational separation. A production operator and player must use independently secured roles.
- The full test suite, independent Solidity/TypeScript replay comparisons, worst-case gas and denial-of-service cases, reserve economics, seed lifecycle, card-observation parser, contract deployment hashes, and all failure exits need external review before any public launch.

## External handoff package

Provide an auditor the exact Git commit, `contracts/src/crypto`, `contracts/test/crypto`, `shared/crypto/replay.ts`, receipt verifier, Foundry settings, and evidence JSON. Ask for protocol/economic and Solidity review together, including player-induced replay failures, unavailable operator compensation, all legal multi-hand actions and chain reorganization handling. Track findings by severity and bind the final review to newly deployed bytecode. No audit completion is represented here.
