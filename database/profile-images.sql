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
