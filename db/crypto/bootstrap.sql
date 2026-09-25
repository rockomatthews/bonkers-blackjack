-- PRIVATE DATABASE ONLY. Initial schema, not a migration for the public demo.
-- Blockchain funds remain authoritative; these tables index workflow and evidence.
BEGIN;
CREATE SCHEMA IF NOT EXISTS crypto_private;
REVOKE ALL ON SCHEMA crypto_private FROM PUBLIC;
CREATE TABLE crypto_private.accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 auth_subject text UNIQUE NOT NULL,
 wallet_address text UNIQUE CHECK(wallet_address ~ '^0x[0-9a-f]{40}$'),
 wallet_verified_at timestamptz,
 eligibility_status text NOT NULL DEFAULT 'pending' CHECK(eligibility_status IN ('pending','approved','excluded','suspended')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((wallet_address IS NULL) = (wallet_verified_at IS NULL))
);
CREATE TABLE crypto_private.intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES crypto_private.accounts(id),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
 request_hash text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('deposit','withdrawal')),
 route text NOT NULL,
 amount numeric(30,0) NOT NULL CHECK(amount > 0),
 status text NOT NULL CHECK(status IN ('quoted','awaiting','detected','confirming','converting','settling','available','owner_authorized','submitted','completed','expired','refund_pending','refunded','review','failed')),
 version bigint NOT NULL DEFAULT 0,
 quote jsonb,
 deposit_address text,
 refund_address text,
 destination_address text,
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,idempotency_key)
);
CREATE TABLE crypto_private.chain_events (
 chain_id bigint NOT NULL,
 transaction_hash text NOT NULL CHECK(transaction_hash ~ '^0x[0-9a-f]{64}$'),
 log_index integer NOT NULL CHECK(log_index >= 0),
 block_number bigint NOT NULL,
 block_hash text NOT NULL CHECK(block_hash ~ '^0x[0-9a-f]{64}$'),
 contract_address text NOT NULL,
 event_name text NOT NULL,
 payload jsonb NOT NULL,
 finalized boolean NOT NULL DEFAULT false,
 orphaned boolean NOT NULL DEFAULT false,
 observed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(chain_id,transaction_hash,log_index)
);
CREATE TABLE crypto_private.intent_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 intent_id uuid NOT NULL REFERENCES crypto_private.intents(id),
 version bigint NOT NULL,
 from_status text NOT NULL,
 to_status text NOT NULL,
 evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(intent_id,version)
);
CREATE TABLE crypto_private.reconciliations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 chain_id bigint NOT NULL,
 block_number bigint NOT NULL,
 block_hash text NOT NULL,
 token_assets numeric(30,0) NOT NULL CHECK(token_assets >= 0),
 accounted_assets numeric(30,0) NOT NULL CHECK(accounted_assets >= 0),
 house numeric(30,0) NOT NULL CHECK(house >= 0),
 reserved numeric(30,0) NOT NULL CHECK(reserved >= 0),
 passed boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intents_work_queue ON crypto_private.intents(status,updated_at);
CREATE INDEX intents_account_history ON crypto_private.intents(account_id,created_at DESC);
CREATE INDEX chain_events_finality ON crypto_private.chain_events(chain_id,block_number) WHERE NOT finalized AND NOT orphaned;
ALTER TABLE crypto_private.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_private.intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_private.chain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_private.intent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_private.reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA crypto_private FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA crypto_private FROM PUBLIC;
COMMIT;
