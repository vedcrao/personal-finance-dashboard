-- Monthly budget per spending category (set on the Spending page or via the assistant).
-- Run after 20261017_multi_user.sql. Safe to re-run.
create table if not exists public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  monthly_amount numeric(12, 2) not null check (monthly_amount > 0),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);
create index if not exists category_budgets_user_idx on public.category_budgets (user_id);

alter table public.category_budgets enable row level security;
drop policy if exists "own rows" on public.category_budgets;
create policy "own rows" on public.category_budgets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
