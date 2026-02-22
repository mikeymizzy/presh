create extension if not exists pgcrypto;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  prompt text not null,
  report text not null,
  created_at timestamptz not null default now(),
  openai_response_id text,
  files jsonb not null
);

alter table public.submissions enable row level security;

drop policy if exists "anon can read submissions" on public.submissions;
create policy "anon can read submissions"
  on public.submissions
  for select
  to anon
  using (true);

drop policy if exists "anon can insert submissions" on public.submissions;
create policy "anon can insert submissions"
  on public.submissions
  for insert
  to anon
  with check (true);
