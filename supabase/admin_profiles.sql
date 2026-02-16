-- Profiles, permissions and user administration tables.

create table if not exists public.account_profiles (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "accountId" bigint not null references public.accounts(id),
  name varchar not null,
  "isSystemAdmin" boolean not null default false,
  "canCreateUsers" boolean not null default false,
  "canCreateProfiles" boolean not null default false,
  "canVoidTransactions" boolean not null default false,
  permissions jsonb not null default '{}'::jsonb,
  "createdById" uuid not null default auth.uid() references auth.users(id)
);

create table if not exists public.users_to_profiles (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "accountId" bigint not null references public.accounts(id),
  "userId" uuid not null references auth.users(id),
  "profileId" bigint not null references public.account_profiles(id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_to_profiles_account_user_unique'
  ) then
    alter table public.users_to_profiles
    add constraint users_to_profiles_account_user_unique unique ("accountId", "userId");
  end if;
end $$;

create table if not exists public.account_user_invitations (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "accountId" bigint not null references public.accounts(id),
  email varchar not null,
  "profileId" bigint references public.account_profiles(id),
  status varchar not null default 'pending',
  "sentAt" timestamptz,
  "expiresAt" timestamptz not null default (now() + interval '7 days'),
  "invalidatedAt" timestamptz,
  "createdById" uuid not null default auth.uid() references auth.users(id)
);

alter table public.account_user_invitations
add column if not exists "sentAt" timestamptz;

alter table public.account_user_invitations
add column if not exists "expiresAt" timestamptz not null default (now() + interval '7 days');

alter table public.account_user_invitations
add column if not exists "invalidatedAt" timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_user_invitations_status_check'
  ) then
    alter table public.account_user_invitations
    add constraint account_user_invitations_status_check
    check (status in ('pending', 'sent', 'linked', 'expired', 'invalidated'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_user_invitations_expires_at_range_check'
  ) then
    alter table public.account_user_invitations
    add constraint account_user_invitations_expires_at_range_check
    check ("expiresAt" <= created_at + interval '7 days');
  end if;
end $$;

alter table public.account_profiles enable row level security;
alter table public.users_to_profiles enable row level security;
alter table public.account_user_invitations enable row level security;

create or replace function public.user_is_account_admin(target_account_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users_to_profiles up
    join public.account_profiles ap on ap.id = up."profileId"
    where up."accountId" = target_account_id
      and up."userId" = auth.uid()
      and ap."isSystemAdmin" = true
  );
$$;

drop policy if exists "accounts_update_admin" on public.accounts;
create policy "accounts_update_admin"
on public.accounts
for update
to authenticated
using (public.user_is_account_admin(id))
with check (public.user_is_account_admin(id));

drop policy if exists "account_profiles_tenant_access" on public.account_profiles;
create policy "account_profiles_tenant_access"
on public.account_profiles
for all
to authenticated
using (public.user_belongs_to_account("accountId"))
with check (public.user_belongs_to_account("accountId"));

drop policy if exists "users_to_profiles_tenant_access" on public.users_to_profiles;
create policy "users_to_profiles_tenant_access"
on public.users_to_profiles
for all
to authenticated
using (public.user_belongs_to_account("accountId"))
with check (public.user_belongs_to_account("accountId"));

drop policy if exists "account_user_invitations_tenant_access" on public.account_user_invitations;
create policy "account_user_invitations_tenant_access"
on public.account_user_invitations
for all
to authenticated
using (public.user_belongs_to_account("accountId"))
with check (public.user_belongs_to_account("accountId"));
