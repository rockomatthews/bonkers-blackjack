# On-chain blackjack rules v2 — October 15, 2026

The rooms and browser-rule release was pushed to main as `df41fc3`. This update brings the contract candidate, TypeScript replay, local dealer worker, deployment artifact, and wallet controls into agreement for insurance and late surrender.

## Rules and accounting

- Insurance is offered to every player, including naturals, when the dealer shows an ace, before the hole-card peek. Buy costs half the initial wager; declining is free. A timeout stand during this phase declines, rather than standing the blackjack hand.
- An insured dealer blackjack returns the insurance premium plus a 2:1 win: 1.5 times the initial wager in gross insurance return. An insured natural yields the even-money result before the original table fee. No insurance is offered on a ten-valued upcard.
- Late surrender is available only on an original unsplit two-card hand after the peek rules out dealer blackjack. It refunds half the initial wager. It is unavailable after hitting, splitting, or doubling.
- Insurance remains locked until settlement, even if the peek rules out a dealer blackjack. Four doubled split hands plus insurance can lock 8.5 initial wagers. The vault now permits that exact bound. The maximum gross payout remains 16 initial wagers because winning insurance is mutually exclusive with split/double play.
- Moves 1–4 retain their meanings. Move 5 buys insurance, 6 declines, 7 surrenders. Game transactions enforce the exact additional stake for each action, including session-key spending caps. Replay's internal return value now measures half-wager units; wallet transactions use exact integer USDC units.
- Observation format 2 binds the insurance phase, each seat's insurance decisions, and surrendered hands. The hole card remains absent until the round is complete.

## Version compatibility

New deployment artifacts declare `rulesVersion: 2`; the contract exposes the same constant. Old immutable contracts are not upgraded. Saved deployments without the version field use the frozen version-one TypeScript engine. Old receipts select their engine from their observation format. A version mismatch fails verification.

The local dealer config also records the rules version. Old configs keep their old replay; new lab deployments record version two. Regenerate the checked-in pilot artifact with `npm run crypto:artifact` after contract changes. The local verification command checks that the exported artifact exactly matches compiled bytecode and its hash.

## Verification

- 61 application/engine/service tests passed.
- 37 Foundry tests passed, including fuzz campaigns, seven-seat insurance decisions, insurance/session exact stakes, timeouts, surrender restrictions, worst-case four doubled split hands plus insurance, locked-stake bounds, and asset conservation.
- `npm run crypto:verify-v2`: fresh local Anvil, chain 31337, mock USDC. 64 rounds / 448 seats / 481 hands reproduced every observation and payout in Solidity from TypeScript transcripts. Coverage: 101 hits, 84 stands, 220 doubles, 33 splits, 7 insurance buys, 6 explicit declines, 103 surrenders. Altered additional stake was rejected.
- Actual local transactions exercised insured dealer blackjack and insurance loss followed by surrender, then withdrawal. Receipt hashes and exact amounts are in [rules-v2-local.json](evidence/rules-v2-local.json). These are local mock-token receipts, not live Base receipts.
- The isolated wallet browser test verified insurance and surrender calldata, exact extra stakes, insufficient-funds disabling, and unavailable surrender on older rules. The wallet and RPC were mocked for this UI test; actual settlement was checked separately on Anvil.
- Production build and TypeScript checks passed. Contract runtime/init code remain within EVM deployment size limits.

Venice was used for design review and targeted source review. Its suggestions were checked against executable tests. Advice to allow or refund a surrender after doubling was rejected: doubling ends the hand, and surrender is explicitly illegal afterward. Two other Venice review attempts returned an upstream error and an empty response; those were not treated as successful reviews. This is not an independent security audit.

No real funds were moved and no live contracts were deployed during this work. The public website remains a play-money table plus the separately gated wallet self-test. Shared production dealer operation, multi-asset conversion, and any live deployment/configuration remain separate work.
