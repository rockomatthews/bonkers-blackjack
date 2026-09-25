# Implementation checkpoint — September 25, 2026

Private development branch: `codex/crypto-private`. **Not ready for real-money play or a launch merge.** No mainnet contracts deployed, funds transferred, or public database modified by this work.

Implemented locally:
- Branch-specific Vercel automatic-deployment exclusion; no public crypto navigation.
- Integer USDC amounts, explicit asset/network registry, private access gate and ES256 identity-token verification.
- EXACT_INPUT conversion adapter with approval gate, metadata checks and quote amount/deadline validation. Provider responses and routes are not yet live-verified.
- Read-only Base RPC balance, deposit-event evidence and reconciliation adapter; unsigned owner transaction preparation.
- Independent initial database schema and transactional/idempotent intent repository. Schema has not been applied or database integration-tested. Supabase CLI migration generation failed on its local telemetry-file permission, so the SQL is explicitly a bootstrap source, not a generated migration.
- Private readiness endpoint; real money remains disabled.
- Development PlayerVault: deposits, owner withdrawals, EIP-712 signed withdrawals, separate liabilities and house reserves, fee accounting and game-contract-only settlement.
- Vault tests cover conservation, reserved collateral, fee refunds, replay/destination binding, pause exits and unauthorized locks.

Critical remaining engineering:
- Production seven-player blackjack verifier, authorized game sessions, turn protocol and enforceable operator-failure deadlines. The vault trusts its immutable game contract; that production contract does not exist yet. Do not deploy it with an operator EOA or mock verifier.
- Embedded-wallet UI, owner proof/recovery, account binding, eligibility enforcement and private cashier screens.
- Persistent chain/conversion workers, transaction relaying, durable retry/outbox, reorg recovery and reconciliation-driven circuit breakers.
- API wiring, database integration tests, end-to-end money and multiplayer tests, mainnet-fork and bounded actual-mainnet evidence.
- Provider acceptance and verified routes, finalized market policy, funded reserves and independent contract/protocol audit.

Remote documentation/approval requests have encountered an OpenAI HTTP 401 in the tool approval service. No workaround bypasses that review. Dependency installation did succeed. Remote push and deployment status must be verified separately; local branch creation is not publication.
