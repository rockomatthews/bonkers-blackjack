# Private crypto implementation

Branch: `codex/crypto-private`. Baseline: `70d92e1`. No automatic Vercel deployments from this branch. Public `main` remains the play-money product. Merging must not, by itself, bypass activation checks.

## Agreed product

Coin/network → deposit address and QR → verified conversion → USDC balance → additive chip stacks → Deal/deadline → on-chain wager and blackjack settlement → withdrawal. Preserve seven seats, six decks, S17, 3:2 naturals, four-hand splits, double-after-split, one card per split ace, no insurance/surrender, and the disclosed 0.25% initial-wager fee rounded down to cents. Fee revenue is not guaranteed profit.

Use native USDC on Base (8453), no proprietary stablecoin. Display dollars alongside USDC; keep token accounting in integer micro-USDC, never floating point. Deposit BTC/Bitcoin, ETH/Ethereum, SOL/Solana, USDT/Ethereum and USDC/Base only when each provider route is approved and verified. Launch with verified routes rather than waiting for every asset. No bonuses, P2P transfers, fiat payments, or desktop clients in this milestone.

## Isolation and activation

- Private GitHub branch with `git.deploymentEnabled` disabled. No public preview or live database migration. Any future preview requires authenticated deployment protection and a separate database with separate secrets, not the demo's production database.
- Local mainnet-fork tests first (Base chain data, locally impersonated/funded accounts, no broadcasts). Owner requested actual mainnet testing instead of testnet. Actual transactions require an identified owner-controlled test wallet, exact funding/gas ceiling and destinations, approved providers, and deployed reviewed contracts. No private keys belong in chat, Git, browser storage, or logs.
- Mainnet private pilot additionally uses account allowlisting, total exposure caps, and authenticated UI/API access. Public blockchain transactions cannot be private just because the website branch is private.
- Modes: disabled, local-fork, private-mainnet, live. Default disabled. Fail closed on absent license eligibility configuration, provider approvals, audit attestations bound to the deployed bytecode, funded collateral, or reconciliation health. Operator can pause new deposits/wagers while allowing legally permitted exits of unlocked funds.
- License and permitted markets are not yet supplied. Provider accounts are not yet approved. Independent audit, provider onboarding, bankroll and infrastructure costs are external dependencies. No unattended paid signup, fund transfer, mainnet deployment or public activation is authorized by this document.

## Delivery sequence

1. **Private foundations:** chain/asset registry, environment checks, money types, auth boundary, independent crypto schema, quote provider adapter, lifecycle state machines, owner-signed transaction preparation, event indexer and reconciliation.
2. **Money path:** embedded recoverable wallet (Privy candidate, acceptance required), confirmed native USDC deposit, sponsored vault credit, on-chain balances, withdrawal authorization with fresh owner authentication, direct USDC withdrawal and quoted outbound conversion. Never credit a provider webhook without independent settlement-chain evidence.
3. **Game protocol:** immutable versioned blackjack verifier, funded table escrow, limited EIP-712 session authorizations, ordered player actions, dealer/card observations bound to the transcript, on-chain deadlines, seed reveal/replay and maximum-payout operator-failure recovery. Do not wire the existing RejectingVerifier or MockVerifier into a launch configuration. Reuse tested rules, not browser-local demo credentials or the singleton demo money store.
4. **Services/UI:** persistent Node worker for chain indexing, conversion reconciliation, relaying, round sequencing and timers; durable PostgreSQL jobs/outbox; reconnectable sequenced events; Vercel hosts UI and HTTP API. Keep pending/confirmed/available/locked/withdrawing values separate. Private cashier and wallet-backed game UI share the existing artwork and controls.
5. **Verification:** differential game replay, fuzzed solvency and concurrency, seven-player rounds, full split/double gas benchmarks, provider fixtures and approved route tests, failed withdrawals, reorg rollback, RPC failover, operator outage, key revocation, identity recovery, intrusion/abuse checks, independent protocol/contract audit and game-math review.
6. **Release preparation:** deploy reviewed contracts, fund reserves, configure signed eligibility policies and countries, rehearse backups and recovery, verify balances on two independent RPCs, freeze artifact hashes. Prepare the merge with activation still closed. Owner authorizes launch once all external requirements are met; activation uses the verified release manifest, not a boolean in client code.

## Interfaces and data

Versioned `/api/crypto/v1` endpoints for capabilities, account/balances, deposit quote/intents, withdrawal quotes/intents, sessions, tables/actions and receipts. Mutations require verified auth, ownership, eligibility and idempotency. Crypto schemas use normalized accounts/wallet bindings, deposit/withdrawal intents, append-only chain events, double-entry projections, round/transcript records, durable jobs and audit events. On-chain state is authoritative; database balances are a reconciled projection.

Money lifecycle: deposit quoted → awaiting → detected → confirming → converting → settling → available (or expired/refund_pending/refunded/review). Provider completion alone never makes funds spendable. Withdrawal quoted → owner_authorized → submitted → confirming → completed (or failed/refund_pending/refunded/review). Retrying uses the same operation identity; unknown submission outcome is reconciled, not resent blindly or refunded immediately.

Session keys can wager/play only within an amount, contract, chain, rules version and expiry. They cannot change withdrawal destinations or recover the owner wallet. Withdrawal destinations and amount are signed by the owner. On-chain requests include domain separation, nonces, deadlines and deployment/version identity.

## Provider constraints verified during discovery

CoinPoker advertises token/network selection, deposit addresses and automated conversion to USDT; this design uses USDC as previously agreed. Do not copy claims of zero fees/minimums or unrestricted eligibility. Sources: https://coinpoker.com/deposits-and-withdrawals/cryptocurrency/

NEAR 1Click EXACT_INPUT provides quote-bound addresses and refunds; ANY_INPUT is partner-only, has a $1,000 sweep threshold and no refunds, so is excluded from consumer deposits. Request explicit amount, expiry, network, refund destination and fees. Never promise an exchange deposit can be refunded to its sending address. Source: https://docs.near-intents.org/integration/distribution-channels/1click-api/swap-types

Privy access tokens use ES256, issuer privy.io, application audience and exp/sub/sid; verified token identity must be bound to an owner-proven wallet. Provider acceptance is not inferred from API availability. Source: https://docs.privy.io/authentication/user-authentication/access-tokens

## Completion standard

Code scaffolding, local tests, dry quotes, an unaudited verifier or a private branch are not proof of launch readiness. The release report must distinguish implemented code, locally verified behavior, actual mainnet evidence, provider approvals, and external audit/licensing blockers. All enabled production routes must pass the complete deposit → wager → settle → withdraw flow against the exact deployed contracts.
