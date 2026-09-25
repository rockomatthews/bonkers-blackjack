-- Dedicated project only. Server-only prototype state; never expose this schema in the Data API.
create schema if not exists bonkers_private;
revoke all on schema bonkers_private from public, anon, authenticated;
create table if not exists bonkers_private.demo_state (
  id integer primary key check (id = 1),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table bonkers_private.demo_state enable row level security;
revoke all on bonkers_private.demo_state from public, anon, authenticated;
-- No client policies: browsers can only use authenticated, signed Next.js endpoints.
-- Next.js connects with a server-only Postgres role. Never prefix this connection URL with NEXT_PUBLIC_.
