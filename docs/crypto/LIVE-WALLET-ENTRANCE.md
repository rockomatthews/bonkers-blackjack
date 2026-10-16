# Live wallet entrance — October 16, 2026

The owner requested removal of the play-mode experience, whole-card room entrances without directional buttons, and real-USDC deposit testing. The owner confirmed that the same connected wallet should fund both the house reserve and player balance for the first test.

## Mode and routing

`BONKERS_MODE=live` is the default. `/` renders the live wallet lobby. Each complete room card is a native link to `/live/<room>`, which opens the actual wallet-backed table using the selected artwork. The live path does not call the simulated account/cashier API, create starter funds, or offer simulated deposits. It uses native USDC on Base, requires a connected wallet, and requires wallet confirmation for every transaction.

The separate simulated game remains at `/practice`. `BONKERS_MODE=practice` restores it as the root page. This switch selects different financial paths; it does not rename simulated money. The older `/crypto-pilot` route remains usable for existing saved wallets. Practice navigation arrows and the small room-arrow buttons have also been removed; the complete room tile is the entrance.

## First real-USDC test

1. Open the site in a wallet-enabled browser and connect the Base wallet.
2. In Cashier, create the wallet table. This deploys the checked-in rules-v2 game/vault artifact using the connected wallet as operator, treasury, and player.
3. Fund the house reserve up to 75 USDC. The wallet approves the exact missing reserve, funds the vault, and unpauses deposits.
4. Choose a player-deposit amount and confirm the approval/deposit. The suggested 42.51 USDC covers four doubled split hands plus insurance and the initial fee; the initial wager remains capped at 5 USDC.
5. Play a hand. House ledger reads actual house, reserved, locked, fee-revenue, accounted, and token balances at a single Base block. The initial-wager fee is 0.25%, floored to cents: 0.01 USDC on a 5 USDC wager.
6. The settlement verifies deterministic replay and checks the actual `WagerLocked` event's recorded fee. Withdraw unlocked player funds, or all unlocked player and house funds, back to the connected wallet.

House bankroll includes initial funding and table fees; it is not presented as profit. Fees are shown separately without adding them a second time. This is the owner's wallet-controlled first test, not a shared production dealer service. Contracts remain unaudited. No site switch upgrades an existing immutable deployment or moves funds without wallet confirmation.

## Verification

- Application tests and TypeScript/production build passed.
- Eight practice browser regressions passed with the practice-mode switch explicitly set.
- Three crypto browser tests passed, including full-card room entrance checks and wallet action stake checks.
- The complete new wallet UI was exercised against a fresh LOCAL Anvil chain with chain ID 8453 and mock USDC installed at the native token address. This was not live Base. The browser deployed the game, funded 75 mock USDC to the house, deposited 42.51 mock USDC, settled a 5-USDC hand, read the 0.01-USDC house fee, reconciled vault assets, and withdrew all unlocked funds. Evidence: `docs/crypto/evidence/live-wallet-ui-local.json`. No browser runtime errors occurred.
- Desktop, portrait-phone, and landscape-phone screenshots are local verification evidence, not proof of live deposits.

Venice reviewed the implementation plan. Actual money-path acceptance evidence comes from source checks, contract tests, and the local chain/browser run. A real Base deposit and house-fee receipt still require the owner's wallet signatures; no such receipt is claimed by this document.
