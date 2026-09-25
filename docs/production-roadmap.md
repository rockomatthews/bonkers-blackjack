# Remaining delivery stages

## Delivered stage: branded play-money prototype

Next.js UI, server-authoritative social table, simulated cashier, browser signatures, round receipts, deterministic verification, PostgreSQL adapter/schema, and automated checks. Logo/name follow the owner's Bonkers Blackjack selection. GitHub/Vercel deliverables are reported separately after remote verification. Supabase connection is owner-managed after deployment.

## Technical proof — not complete

- Integrate a provider-approved recoverable wallet and real email/passkey authentication. Replace browser-local demo identity with real authorization boundaries; preserve a bounded, revocable session model.
- Integrate NEAR Intents 1Click or another approved route behind an asset/network allowlist. Verify terms for gambling use, quote/refund behavior, finality policies, route coverage, and outbound conversion before choosing it for production.
- Design and implement a contract-verifiable multi-seat transcript binding entropy, shuffle, actions, funding, deadlines, and exact outcomes. Current `RejectingVerifier` intentionally rejects settlement; the escrow prototype is not a blackjack proof system.
- Resolve abort/withholding, missing action data, player inactivity, and operator-versus-player fault attribution. Benchmark the complete verifier's gas cost against realistic split/double seven-seat rounds.
- Deploy only to a test network with test tokens after local and protocol reviews. No wallet or on-chain deployment is performed by this repository's setup scripts.
- Replace single-record demo persistence with normalized append-only state/event and ledger tables; add chain indexer, deduplication, confirmations, reorg handling, reconciliation, and private authenticated Realtime channels.

## Production hardening — not complete

Independent contract/protocol audit and game-math review; provider eligibility; owner-supplied licensing requirements; geofencing/identity/exclusion hooks; reserve policy and bankroll funding; incident procedures; rate limits and abuse protection; credential recovery; observability/alerts; backup restore drills; and reliable deadline execution. Resolve all critical/high findings before live funds.

## Real-money rollout — not enabled

Only after the above: conservative table exposure, funded collateral, independently verified deployed contracts, monitored deposits/withdrawals, and tested operator failure recovery. Independent audits are external work and cannot be substituted with repository tests.

## macOS and Windows — deferred as planned

After the web experience stabilizes, package the shared React client with Tauri against the same versioned API. Add deep-link routing, secure native credential storage, code signing, macOS notarization, signed updates, and platform tests. No desktop binary is supplied or implied by this web milestone.
