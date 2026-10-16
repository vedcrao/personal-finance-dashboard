-- Free, self-hosted error monitoring: server + app errors land here; view them in Settings → Error log (owner only).
-- Run after 20261018_category_budgets.sql. Safe to re-run.
create table if not exists public.error_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('server', 'client')),
  message text not null,
  stack text,
  path text,
  user_id uuid,
  user_agent text,
  context jsonb
);
create index if not exists error_logs_created_idx on public.error_logs (created_at desc);
alter table public.error_logs enable row level security; -- server-only (service role); no policies
