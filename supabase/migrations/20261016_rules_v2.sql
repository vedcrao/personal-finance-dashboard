-- Rules v2 (amount conditions, direction, names) + resumable categorization.
-- Run after 20261015_automation.sql. Safe to re-run.

-- 1. Richer rules: "Zelle to Rohan, $100+, money out → Gym"
alter table public.categorization_rules add column if not exists name text;
alter table public.categorization_rules add column if not exists min_amount numeric(12, 2);
alter table public.categorization_rules add column if not exists max_amount numeric(12, 2);
-- 'in' = money in, 'out' = money out, null = either
alter table public.categorization_rules add column if not exists direction text check (direction in ('in', 'out'));
-- 'editor' (Apply to similar) | 'assistant' (chat) | 'manual' (rules page)
alter table public.categorization_rules add column if not exists source text not null default 'editor';
alter table public.categorization_rules add column if not exists updated_at timestamptz not null default now();

-- Several rules can share the same text with different amount ranges
alter table public.categorization_rules drop constraint if exists categorization_rules_user_id_match_key;
create index if not exists categorization_rules_user_idx on public.categorization_rules (user_id);

-- 2. Resumable re-categorization: each chunk stamps what it processed
alter table public.transactions add column if not exists categorized_at timestamptz;
create index if not exists transactions_user_category_idx on public.transactions (user_id, category);
