# Bonkers Blackjack

A Next.js social-blackjack **play-money prototype**, using the owner's original logo. Built for GitHub → Vercel with a dedicated Supabase PostgreSQL database.

## What works

- Responsive landing page, lobby, seven-seat public/private tables, invitation links, spectators, reactions, optional sound, and account/history/fairness screens.
- Server-authoritative six-deck blackjack: fresh shuffle, 3:2 naturals, S17, dealer peek, doubling, splitting to four hands, and automatic stand on a 25-second timeout.
- Browser-local demo identities, P-256 signed commands, nonce replay protection, explicit expiring gameplay budgets, and reconnect after refresh.
- Simulated BTC/ETH/SOL/USDT/USDC cashier with quotes, demo-only QR identifiers, conversion states, expiry, failed-route tests, and withdrawal refunds.
- SHA-256 shuffle commitments, player entropy, signed transcripts, downloadable receipts, and a browser/CLI replay verifier.
- PostgreSQL transactions serialize concurrent requests across Vercel instances. Local development uses an atomic JSON store.

**No real money, real crypto address, embedded wallet, passkey provider, swap provider, deployed contract, or blockchain settlement is enabled.** The demo signing key is not a crypto wallet and is stored in this browser's local storage. Clearing storage loses that demo identity.

## Run locally

```sh
npm ci
npm run dev
# http://127.0.0.1:3000
```

No environment variables are needed for a single-process local demo. Local state persists in `.data/state.json`, which is ignored by Git. Each new demo account receives $1,000 of play money; the signup checkbox explicitly authorizes a $500 one-hour session. The cashier is a simulation/faucet, not a financial ledger.

## Vercel + Supabase setup

1. Import this GitHub repository into Vercel. Framework: **Next.js**, root: repository root. Use Node.js 24.
2. The deployed landing page and guides work immediately. Without a database, shared-table signup is disabled and tables show an opening-soon state.
3. Create/connect a **dedicated Supabase database** from the Vercel project's Storage/Marketplace integration, as planned by the owner. Do not repurpose another product's database.
4. In Supabase SQL Editor, run [`database/schema.sql`](database/schema.sql). It creates `bonkers_private.demo_state` and `bonkers_private.profile_images`; the schema is not exposed through the Data API, RLS is enabled, and anonymous/authenticated access is revoked.
5. Set **`POSTGRES_URL`** in Vercel to the project's transaction-pooler connection URL from Supabase's Connect dialog. The integration may supply this already. `DATABASE_URL` is supported as a fallback. Use the actual provided pooler host; do not invent it. Use certificate-validated TLS (`sslmode=verify-full`, with Supabase's CA if needed); never disable certificate verification. Never add a `NEXT_PUBLIC_` prefix to credentials.
The server and setup script automatically trust the public Supabase Root 2021 CA for Supabase database/pooler hosts while verifying both certificate and hostname. The bundled certificate expires in April 2031; review it when Supabase rotates its CA. Other PostgreSQL hosts retain their provided TLS settings.

6. Redeploy. Visit `/api/v1/config` (`sharedTablesReady: true`), then `/api/v1/health` (`storage: postgres`, `conserved: true`). The config endpoint detects configuration presence; the health endpoint verifies the actual database connection/schema.
7. Complete signup, deposit simulation, a shared round, a reload, receipt verification, and failed-withdrawal recovery on the deployed site before calling the database integration verified.

Alternatively, apply the schema from a secure environment with `POSTGRES_URL` set:

```sh
npm run db:setup
```

Use a separate Supabase project/database for Vercel preview deployments. Do not point experimental PR previews at production state.

## Verification

```sh
npm run typecheck
npm test
npx playwright install chromium  # once per machine
npm run test:e2e
npm run build
npm run contracts:test          # requires Foundry
node --import tsx scripts/verify-receipt.ts path/to/receipt.json
```

Playwright uses seven independent browser contexts with isolated identities, a private table, real signed HTTP commands, a reload during the round, and matching receipts. It starts its own Next.js server; stop another `next dev` process for this project before running it. Screenshots are saved under `docs/screenshots/`.

## Architecture and limits

See [`docs/architecture.md`](docs/architecture.md), [`docs/production-roadmap.md`](docs/production-roadmap.md), and [`contracts/README.md`](contracts/README.md).

This release uses one-second table polling rather than a persistent WebSocket server because it is hosted on Vercel. Deadlines live in persisted state and are evaluated transactionally on each request. If everyone goes offline, the next request resumes timeout handling; funds do not disappear. There is no background cron or live-money liveness guarantee.

The single locked JSONB record deliberately serializes a small demo. It is **not a high-throughput production schema**. Before real-money use, replace it with normalized accounts, table streams, immutable events, ledger entries, and contract indexing. Supabase Realtime can provide private, authenticated update notifications at that stage; authoritative decisions must remain transactional.

## Brand

**Bonkers Blackjack** and `public/bonkers-blackjack-logo.png` were supplied by the owner. The source image is copied byte-for-byte; it is not regenerated. This selection supersedes the earlier proposal to explore three names. Red, black, ivory, and gold carry through the site; table themes provide the visual variation.

## Orbital room and table fee

The owner's `pokerRoom.png` is preserved byte-for-byte in `public/` and used as the backdrop for the first public table and private rooms. Cards, seats, statuses, and controls are live UI overlays. Smaller screens can pan across the room; a separate hand panel keeps every personal hand readable.

New signed wagers acknowledge `initial-wager-25bps-floor-cent-v1`: 0.25% of the initial wager, rounded down to a cent, charged once at wager lock. A $5 wager costs $5.01, $25 costs $25.06, and $100 costs $100.25. Splits and doubles add only their extra stake. The fee applies to wins, losses, naturals, and pushes, counts against the authorized session budget, and is included in the displayed net result. It is additional to the ordinary blackjack house edge, and is revenue rather than guaranteed per-round profit. All amounts remain play money.

Version 2 round receipts include fees and verify them against signed wager pricing. Existing version 1 receipts still verify, and wagers already locked before this release finish without a retroactive charge. Optional stored fee fields require no SQL migration. Real-money contracts remain research prototypes and do not implement this fee policy.

## Player profiles

New demo accounts receive a unique random username. Players may claim one available permanent name from their profile; names are case-insensitive, normalized, and contain 3–24 letters, numbers, spaces, underscores, or hyphens. The server enforces the one-change limit and rejects collisions atomically. Existing accounts keep their names and receive one change. Names cannot change while a wager is unsettled.

Profiles have stable, shareable account-ID links. Preset avatars and uploaded profile images remain editable after the name is locked. Uploads are resized and re-encoded as 160px WebP images on the server, stored separately from game state, and served through an image endpoint. Public profiles expose only the player ID, username, avatar, and name-change status.

For an existing database, apply `database/profile-images.sql` before deploying this feature. Fresh installations use `database/schema.sql`, which includes both private tables. Neither table grants client database access. Local development saves images under the ignored data directory. Profile names and images are public; balances, session keys, and wallet information are not part of public profiles.
