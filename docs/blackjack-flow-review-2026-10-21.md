# Blackjack flow and production failure review

Reviewed 2026-10-21. Venice was consulted for an independent engineering checklist; its suggestions were checked against source and public chain evidence.

## Public evidence

The failed offer in the supplied screenshot was round `0xf92b3a1cdf644beac1e8bce805e2a74669cb30eb4f0f86d6a13681f46d8099c0`, offered at Base block 52887322. A historical `eth_call` of `joinFor` at block 52887323 succeeded through Base RPC with the actual authorized session address. Current reads confirmed the same owner, the full 40-USDC allowance, and the full 0.00002-ETH gas allocation still present. The offer subsequently expired without a joined player. This points to the injected wallet RPC preparation/broadcast path, rather than an accepted wager with hidden cards. No financial transactions were submitted during this investigation.

The browser now signs gameplay locally and uses an authenticated Base RPC endpoint for reads, simulation, gas estimation, receipts, and broadcasting. Signed broadcasts are limited to the deployed game, chain 8453, zero native value, `joinFor`/`actFor`, the authenticated owner, and a matching unexpired on-chain session. Wallet/admin RPC methods are rejected. No private key is transmitted to the endpoint. Accepted gameplay broadcasts also schedule server-side dealer advancement after their receipt, so the next browser poll is not required to start, observe, or settle the hand.

## Flow references

- [Stake Blackjack](https://stake.com/casino/games/blackjack): wager first, initial cards, then Hit/Stand and legal Split/Double choices; insurance appears for a dealer ace.
- [Evolution Live Blackjack](https://games.evolution.com/live-casino/live-blackjack/): seat and wager selection precede Deal; First Person Blackjack supports selecting multiple hands and starting at the player's pace.
- [Evolution Speed Blackjack](https://www.evolution.com/investors/financial-publications/press-releases/evolution-launches-super-fast-speed-blackjack-6fc37b83): actions are offered after the initial two cards; reducing decision waiting is central to flow.

Bonkers uses these interaction conventions with its existing artwork and independent contract rounds; no proprietary game implementation or branding was copied.

## Resulting flow

1. Connect on the homepage and stay there. Choose a game while signed in.
2. At blackjack, choose an amount to bring. This authorizes a cumulative spending cap against already-deposited Bonkers USDC, not another deposit. Gas funding and the approval's hard expiry are disclosed.
3. A fresh table has no dealer or player cards. Completed historical hands are not rendered on entrance; a genuinely active round can be resumed.
4. Select a chip, tap seats, then Deal. Show actual confirmed cards and actions from the current round. Keep chips separate from cards and avoid raw provider error dumps.
5. Show verified outcome and net amount after settlement. Clear staged chips. Rebet restores the accepted layout without starting another wager.
6. After 15 minutes without input, discard the in-memory signing key and staged chips while preserving cashier access. Background polling does not count as activity. The existing fixed on-chain permission is not described as automatically revoked: its hard maximum is one hour, and Leave table explicitly revokes it.

## Validation boundaries

Local tests deliberately reject injected-wallet gameplay reads and raw broadcasts while exercising actual local contract joins, player decisions, settlement replay, multiple seats, Rebet, deposits, and withdrawals through the new path. Additional tests cover homepage navigation/login restoration, empty entrance state, 15-minute inactivity, and signed-call restrictions. These tests and historical simulation do not establish that a new funded production hand has been played successfully.
