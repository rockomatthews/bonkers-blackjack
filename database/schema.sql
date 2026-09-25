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
-- Small normalized avatars only; metadata stays in the existing private demo state.
create table if not exists bonkers_private.profile_images (
  id uuid primary key,
  owner_id uuid not null,
  image bytea not null check (octet_length(image) <= 24576),
  created_at timestamptz not null default now()
);
create index if not exists profile_images_owner on bonkers_private.profile_images(owner_id);
alter table bonkers_private.profile_images enable row level security;
revoke all on bonkers_private.profile_images from public, anon, authenticated;
-- No client policies. Only the server's signed upload endpoint can write images.
