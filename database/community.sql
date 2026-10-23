-- Applied with Supabase migration bonkers_public_flip_start_and_room_chat.
-- Only the server's postgres connection can access these private rows.
create table if not exists bonkers_dealer.community (
 id text primary key check (id ~ '^[a-z-]{1,40}$'),
 data jsonb not null check (jsonb_typeof(data)='object')
);
alter table bonkers_dealer.community enable row level security;
revoke all on bonkers_dealer.community from public, anon, authenticated;
