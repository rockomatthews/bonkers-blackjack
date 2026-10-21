# Multi-seat gameplay repair — 2026-10-21

The previous Deal loop stopped at the first failed confirmation. Remaining seats stayed as staged chips, and polling explicitly skipped unjoined offers. An uncertain transaction response could therefore strand a selected seat until manual recovery.

Deal now records explicit per-round join intents, clears the staged layout, attempts every selected seat, and automatically retries unfinished joins. Signed gameplay transactions are retained in tab memory before broadcast. Retries use the same signed bytes and transaction hash; a serialized signing queue prevents overlapping nonce preparation. Table polling continues to refresh other hands if a pending transaction cannot yet be confirmed. The routine Resume button has been removed; an exceptional recovery control remains inside Interrupted hand for offers restored without this tab's original intent.

Both occupied hands stay visible. Hit keeps focus on that hand while the dealer updates it; a finished hand transfers focus to another available turn. Hand totals are larger than seat labels, wager amounts are labeled Bet, and chip selection is hidden during play to leave mobile cards unobstructed. Rebet retains the whole selected layout.

Reference: CoinPoker's public blackjack guide, https://coinpoker.com/online-casino/blackjack/ , describes concurrent hands, clear graphics, and digital play at the player's pace. Public reference material was reviewed; no CoinPoker real-money session was played or copied.

Validation: 80 unit tests and 18 browser tests passed. The local Anvil/mock-USDC test discarded a successful broadcast response and separately failed the other seat's gas estimate. Both hands appeared automatically before any player decision, exactly two distinct join hashes were observed, both rounds settled, receipts verified, and Rebet restored the complete layout. Desktop and mobile tests check both hands, total/seat font hierarchy, focus retention through Hit, and automatic focus after completion.

Scope: no contract or payout rules changed; existing on-chain turn deadlines still apply independently to each seat. Local simulated transactions are not funded production gameplay proof. Production checks use a new unfunded QA wallet and prohibit wallet transactions.
