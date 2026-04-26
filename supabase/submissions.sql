create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete cascade,
  student_name text not null,
  prompt text not null,
  report text not null,
  created_at timestamptz not null default now(),
  openai_response_id text,
  files jsonb not null
);

alter table public.submissions add column if not exists user_id uuid references public.app_users(id) on delete cascade;

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.submissions enable row level security;

drop policy if exists "anon can read app_users" on public.app_users;
create policy "anon can read app_users"
  on public.app_users
  for select
  to anon
  using (true);

drop policy if exists "anon can insert app_users" on public.app_users;
create policy "anon can insert app_users"
  on public.app_users
  for insert
  to anon
  with check (true);

drop policy if exists "anon can read app_sessions" on public.app_sessions;
create policy "anon can read app_sessions"
  on public.app_sessions
  for select
  to anon
  using (true);

drop policy if exists "anon can insert app_sessions" on public.app_sessions;
create policy "anon can insert app_sessions"
  on public.app_sessions
  for insert
  to anon
  with check (true);

drop policy if exists "anon can delete app_sessions" on public.app_sessions;
create policy "anon can delete app_sessions"
  on public.app_sessions
  for delete
  to anon
  using (true);

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
