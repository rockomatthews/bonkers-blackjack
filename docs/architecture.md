# Implementation boundaries

## Request flow

Client → Next.js route handler → PostgreSQL transaction + row lock → game service → deterministic game engine → sanitized snapshot.

The local adapter executes the same service with a serialized promise queue and atomic file replacement. It is disabled on Vercel. Only the database adapter reads `POSTGRES_URL`/`DATABASE_URL`; credentials and unrevealed seeds never enter the client bundle.

Signed commands include a unique ID, monotonic account nonce, table ID, command kind, and payload. P-256 signatures are verified against the account public key before mutation. Wagers bind to the current shuffle commitment; moves bind to their round ID. HTTP bearer tokens permit reading that account but cannot authorize commands without its browser key. These are demo credentials, not production authentication.

## HTTP v1

- `GET /api/v1/config`: deployment mode and whether shared storage is configured.
- `GET /api/v1/health`: storage access, reserve totals, and demo conservation invariant.
- `POST /api/v1/demo-login`: `{name, publicKey}`; returns demo bearer token and account.
- `GET /api/v1/account`: own available balance, session limit, nonce, active table, and transfers.
- `GET /api/v1/tables`: public tables only.
- `GET /api/v1/tables/:id`: sanitized table plus own account if authenticated; private IDs are capability-style invitation secrets.
- `POST /api/v1/commands`: `{command, signature}`. Kinds: authorize, revoke, seat, leave, bet, deal, next, hit, stand, double, split, reaction, create-table, deposit, withdrawal, simulate, fail-transfer.
- `GET /api/v1/receipts[/:roundId]`: completed receipts for participating account only.

No API accepts production deposits or transaction hashes. QR codes contain an invalid-for-payment `demo:` identifier. Static conversion prices are labeled illustrative. Only explicit asset/network pairs are accepted. A failed or expired transfer never credits funds; failed withdrawals return their reserved play money once.

## Game math

Integer cents only; whole-dollar initial wagers guarantee exact 3:2 payouts. Fisher-Yates shuffling uses SHA-256 counter output and rejection sampling to avoid modulo bias. Card IDs 0–311 identify six distinct decks. The shuffle domain contains a versioned rule ID, server seed, ordered player entropy, and counter.

House demo cash holds locked stakes, with a conservative reservation of sixteen times each initial wager until settlement. Available account balances plus house demo cash equal the issued play-money supply. Cashier withdrawals remove simulated supply on reservation and restore it on failure.

## Fairness limits

The independent verifier checks receipt integrity, commitment, deterministic shuffle, player bet signatures, ordered action signatures, legal moves, and final gross payouts. It rejects tampered and replayed envelopes. It does not prove account funding, session authorization, external publication timing, or actual timeout passage. Automatic stands are explicitly server-generated records. The server knows future cards. The website does not claim on-chain settlement or hidden-from-operator cards.

A production design needs independently enforceable timing, available transcript data, authorized entropy collection, proof-bound settlement, and an audited timeout policy. Do not treat a published receipt hash as a settlement proof.

## Security and capacity

State lives in a non-exposed Postgres schema. RLS is on with no browser policies; client roles have no privileges. Browser requests can access only sanitized snapshots. All real-money modes fail closed. The row lock prevents duplicate spending across Vercel instances. Read/poll requests currently also acquire this lock to advance timers and cashier simulations.

This demo caps accounts at 1,000, private rooms at 100, and retained receipts at 100 per table. It does not provide a hardened public signup rate limiter, wallet recovery, account deletion, a production authentication service, moderation, abuse detection, or high-volume scaling. Do not open it to real funds.
