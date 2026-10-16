# Rooms and blackjack rules

Started from commit `cf6ac1f` on `codex/bonkers-rules-rooms` in a separate checkout. No uncommitted source from the original checkout was included.

## Implemented

- Supplied logo and exact nightclub/cartoon artwork; all three rooms selectable from the lobby.
- Per-room card coordinates, including lower side hands and separate cartoon-table geometry. Full-screen controls remain accessible without page scrolling.
- Six decks, fresh committed shuffle per round, S17, American hole-card peek, 3:2 natural blackjack, 1:1 ordinary wins, pushes, soft aces, busts.
- Double any original two-card hand or eligible split hand, one draw then stand; extra stake and session allowance enforced.
- Equal-rank splits to four hands, doubling after splits, split aces one card each without resplitting; split 21 pays as an ordinary hand.
- Insurance offered before the ace peek to all players, including naturals. Optional half-wager stake, 2:1 win plus stake return. A missed insurance decision declines without a debit. Insured naturals provide the even-money result before the existing fee.
- Late surrender returns half the original wager after the peek; unavailable after a hit or split. No optional side-bet games.
- Signed action replay covers insurance and surrender. Original-rules games and receipts retain the frozen original engine.
- Doubling explains missing funds, exhausted allowance, expired sessions, or card-count restrictions. Session renewal is accessible inside the room.

## Venice use

Venice's `qwen3-coder-480b-a35b-instruct-turbo` reviewed the engine before and after implementation. Responses were reviewed against the source and deterministic tests. Incorrect suggestions about gross insurance returns and split-ace play were rejected; the implemented insurance return is three times the insurance stake (stake returned plus a 2:1 win).

## Verification

- Production build and TypeScript checks passed.
- 56 engine/service tests passed, including 10,000 deterministic rounds, insurance payout/debits/timeout, surrender, doubling, splits, original-rules receipt replay, and conservation of balances.
- All 8 browser tests passed, including seven actual browser identities sharing a round and verifying the receipt, cashier simulation, profiles, editable chips, and mobile navigation.
- Dedicated room/controls browser test passed again after final UI edits. All three rooms checked at 1440x900, 1280x650, 390x844, and 844x390. Four split hands checked at desktop, portrait phone, and landscape phone sizes.
- `docs/screenshots/*-rules.png` and `four-split-hands-*.png` are deterministic mocked-table UI fixtures, not real-money game evidence. The other regression browser tests use the real local application API.

This change updates the browser play-money game. It does not deploy the site or extend the separate on-chain contract rules to insurance and surrender.
