-- Multi-user: Supabase Auth accounts, usernames, each user's own Plaid keys.
-- Run after 20261016_rules_v2.sql. Safe to re-run.

-- 0. The original single-user schema had a different `profiles` table
--    (id, phone, plaid_access_token, plaid_item_id). Keep it, out of the way.
--    It holds a stale plaintext Plaid access token: drop it once you've confirmed
--    everything works:  drop table public.profiles_legacy;
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'plaid_access_token'
  ) then
    alter table public.profiles rename to profiles_legacy;
    alter table public.profiles_legacy enable row level security;
  end if;
end $$;

-- 1. Public profile (username) for each auth user
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  email text not null,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$')
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));
create unique index if not exists profiles_email_key on public.profiles (lower(email));

-- 2. Each user's Plaid API keys. The secret is AES-256-GCM encrypted by the server
--    (CREDENTIALS_ENCRYPTION_KEY); it is never readable from the browser.
create table if not exists public.plaid_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  client_id text not null,
  secret_ciphertext text not null,
  environment text not null check (environment in ('sandbox', 'production')),
  updated_at timestamptz not null default now()
);

-- 3. Row Level Security. API routes use the service role (bypasses RLS) and always
--    filter by the signed-in user's id; these policies are defense in depth in case
--    the public anon key is ever used directly.
alter table public.profiles enable row level security;
alter table public.plaid_credentials enable row level security; -- no policies: server-only

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['plaid_items','accounts','transactions','user_settings','savings_goals','balance_snapshots','categorization_rules']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- 4. Lookups used on every request / webhook
create index if not exists plaid_items_user_idx on public.plaid_items (user_id);
create index if not exists accounts_user_idx on public.accounts (user_id);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
