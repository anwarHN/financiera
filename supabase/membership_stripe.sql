-- Stripe membership model:
-- - Trial 5 days
-- - Subscription billed per user (seat)

alter table public.accounts
add column if not exists "billingStatus" varchar not null default 'trialing';

alter table public.accounts
add column if not exists "trialEndsAt" timestamptz not null default (now() + interval '5 days');

alter table public.accounts
add column if not exists "stripeCustomerId" text;

alter table public.accounts
add column if not exists "stripeSubscriptionId" text;

alter table public.accounts
add column if not exists "subscriptionPriceId" text;

alter table public.accounts
add column if not exists "subscriptionCurrentPeriodEnd" timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounts_billing_status_check'
  ) then
    alter table public.accounts
    add constraint accounts_billing_status_check
    check ("billingStatus" in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'unpaid'));
  end if;
end $$;

create table if not exists public.account_billing_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "accountId" bigint references public.accounts(id),
  "eventType" text not null,
  "stripeEventId" text,
  payload jsonb not null default '{}'::jsonb
);

alter table public.account_billing_events enable row level security;

drop policy if exists "account_billing_events_tenant_access" on public.account_billing_events;
create policy "account_billing_events_tenant_access"
on public.account_billing_events
for select
to authenticated
using ("accountId" is not null and public.user_belongs_to_account("accountId"));
