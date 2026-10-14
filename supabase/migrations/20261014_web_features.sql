-- Web dashboard features (Stitch "Obsidian Glow" redesign)
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. APY on savings accounts (user-entered; Plaid doesn't provide it)
alter table public.accounts add column if not exists apy numeric(6, 3);

-- 2. Per-user settings (weekly spending budget, etc.)
create table if not exists public.user_settings (
  user_id uuid primary key,
  weekly_budget numeric(12, 2),
  updated_at timestamptz not null default now()
);

-- 3. Savings goals, optionally tracked against a specific account's balance
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid references public.accounts (id) on delete set null,
  name text not null,
  target_amount numeric(12, 2) not null check (target_amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists savings_goals_user_idx on public.savings_goals (user_id);

-- 4. Daily balance snapshots — Plaid only returns *current* balances, so we record
--    one row per account per day to power the net worth / portfolio history charts.
create table if not exists public.balance_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  account_id uuid not null references public.accounts (id) on delete cascade,
  account_type text not null,
  date date not null,
  current_balance numeric(14, 2) not null,
  unique (account_id, date)
);
create index if not exists balance_snapshots_user_date_idx on public.balance_snapshots (user_id, date);

-- These tables are only accessed with the service role key from API routes.
alter table public.user_settings enable row level security;
alter table public.savings_goals enable row level security;
alter table public.balance_snapshots enable row level security;
