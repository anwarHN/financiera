-- PayPal membership model migration
-- Keeps existing billing columns and repurposes subscription id column.

alter table public.accounts
add column if not exists "paypalSubscriptionId" text;

alter table public.accounts
add column if not exists "billingProvider" text not null default 'paypal';

alter table public.accounts
add column if not exists "paypalPayerId" text;

update public.accounts
set "billingProvider" = 'paypal'
where coalesce("billingProvider", '') = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounts_billing_provider_check'
  ) then
    alter table public.accounts
    add constraint accounts_billing_provider_check
    check ("billingProvider" in ('paypal', 'stripe'));
  end if;
end $$;

-- Preserve old data: if paypalSubscriptionId is empty and stripeSubscriptionId exists, copy it.
update public.accounts
set "paypalSubscriptionId" = "stripeSubscriptionId"
where "paypalSubscriptionId" is null and "stripeSubscriptionId" is not null;

-- Optional helper index for webhook lookups.
create index if not exists idx_accounts_paypal_subscription_id
on public.accounts ("paypalSubscriptionId");
