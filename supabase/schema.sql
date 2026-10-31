-- Optional profile data foundation. Authentication does not depend on this table:
-- the current UI saves the display name through Supabase Auth user metadata.
-- Run against a new Supabase project in SQL Editor or as a reviewed migration.
begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Remove broad default grants, then grant only operations covered by policies.
revoke all on table public.profiles from public, anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users insert their own profile" on public.profiles;
create policy "Users insert their own profile" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profile_updated_at();

commit;

-- Do not put passwords, auth tokens, provider secrets, or authorization roles
-- in profile data. No public read or delete policy is granted.
