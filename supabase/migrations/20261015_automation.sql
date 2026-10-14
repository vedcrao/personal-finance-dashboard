-- Automatic sync (Plaid webhooks + /transactions/sync) and rule-based categorization.
-- Run once in the Supabase SQL editor after 20261014_web_features.sql. Safe to re-run.

-- 1. Per-Item sync state
alter table public.plaid_items add column if not exists transactions_cursor text;
alter table public.plaid_items add column if not exists last_synced_at timestamptz;
-- 'ok' | 'login_required' | 'pending_expiration' | 'error'
alter table public.plaid_items add column if not exists status text not null default 'ok';
alter table public.plaid_items add column if not exists status_detail text;

-- 2. Transactions: how it counts + where its category came from
alter table public.transactions add column if not exists pending boolean not null default false;
-- null = automatic; otherwise the user's choice
alter table public.transactions add column if not exists flow_override text
  check (flow_override in ('income', 'expense', 'reimbursement', 'transfer'));
-- 'rule' | 'plaid' | 'llm' | 'user'
alter table public.transactions add column if not exists category_source text;

-- 3. "Always treat transactions like this one this way" rules
create table if not exists public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  -- case-insensitive substring matched against "merchant_name description"
  match text not null,
  category text,
  flow_override text check (flow_override in ('income', 'expense', 'reimbursement', 'transfer')),
  created_at timestamptz not null default now(),
  unique (user_id, match)
);
alter table public.categorization_rules enable row level security;

-- Seed the rule that used to be hard-coded in /api/ai/categorize
insert into public.categorization_rules (user_id, match, category, flow_override)
values ('0f64105d-5a67-4f2b-b8c9-dd2bdb0c4abc', 'zelle payment to jay vanam', 'Rent', 'expense')
on conflict (user_id, match) do nothing;
