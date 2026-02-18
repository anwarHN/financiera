-- Payment methods and account-owned payment forms
-- Also adds fields for purchase/payment transaction flows and system payment concepts.

create table if not exists public.payment_methods (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "accountId" bigint not null references public.accounts(id),
  code varchar not null,
  name varchar not null,
  "isSystem" boolean not null default true,
  is_active boolean not null default true
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'payment_methods_code_key'
  ) then
    alter table public.payment_methods drop constraint payment_methods_code_key;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_methods_account_code_unique'
  ) then
    alter table public.payment_methods
    add constraint payment_methods_account_code_unique unique ("accountId", code);
  end if;
end $$;

create table if not exists public.account_payment_forms (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "accountId" bigint not null references public.accounts(id),
  name varchar not null,
  kind varchar not null,
  provider varchar,
  reference varchar,
  "employeeId" bigint references public.employes(id),
  "isActive" boolean not null default true,
  "createdById" uuid not null default auth.uid() references auth.users(id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'account_payment_forms_kind_check'
  ) then
    alter table public.account_payment_forms
    add constraint account_payment_forms_kind_check
    check (kind in ('cashbox', 'bank_account', 'credit_card'));
  end if;
end $$;

alter table public.transactions
add column if not exists "paymentMethodId" bigint references public.payment_methods(id);

alter table public.transactions
add column if not exists "accountPaymentFormId" bigint references public.account_payment_forms(id);

alter table public.transactions
add column if not exists "referenceNumber" varchar;

alter table public.transactions
add column if not exists "isReconciled" boolean not null default false;

alter table public.transactions
add column if not exists "reconciledAt" date;

alter table public.concepts
add column if not exists "isAccountPayableConcept" boolean not null default false;

alter table public.concepts
add column if not exists "isIncomingPaymentConcept" boolean not null default false;

alter table public.concepts
add column if not exists "isOutgoingPaymentConcept" boolean not null default false;

alter table public.concepts
add column if not exists "isSystem" boolean not null default false;

create or replace function public.prevent_system_concept_changes()
returns trigger
language plpgsql
as $$
begin
  if old."isSystem" then
    raise exception 'System concept cannot be modified or deleted.';
  end if;
  return old;
end;
$$;

drop trigger if exists block_system_concepts_update on public.concepts;
create trigger block_system_concepts_update
before update on public.concepts
for each row
when (old."isSystem" = true)
execute function public.prevent_system_concept_changes();

drop trigger if exists block_system_concepts_delete on public.concepts;
create trigger block_system_concepts_delete
before delete on public.concepts
for each row
when (old."isSystem" = true)
execute function public.prevent_system_concept_changes();

alter table public.account_payment_forms enable row level security;
alter table public.payment_methods enable row level security;

drop policy if exists "account_payment_forms_tenant_access" on public.account_payment_forms;
create policy "account_payment_forms_tenant_access"
on public.account_payment_forms
for all
to authenticated
using (public.user_belongs_to_account("accountId"))
with check (public.user_belongs_to_account("accountId"));

drop policy if exists "payment_methods_tenant_access" on public.payment_methods;
create policy "payment_methods_tenant_access"
on public.payment_methods
for all
to authenticated
using (public.user_belongs_to_account("accountId"))
with check (public.user_belongs_to_account("accountId"));

create or replace function public.validate_payment_transaction_detail_balance()
returns trigger
language plpgsql
as $$
declare
  paid_transaction_total numeric;
  current_paid_amount numeric;
  attempted_total numeric;
begin
  if new."transactionPaidId" is null then
    return new;
  end if;

  select t.total
  into paid_transaction_total
  from public.transactions t
  where t.id = new."transactionPaidId";

  if paid_transaction_total is null then
    raise exception 'Referenced paid transaction not found.';
  end if;

  select coalesce(sum(td.total), 0)
  into current_paid_amount
  from public."transactionDetails" td
  where td."transactionPaidId" = new."transactionPaidId"
    and (tg_op = 'INSERT' or td.id <> new.id);

  attempted_total := current_paid_amount + coalesce(new.total, 0);
  if attempted_total > paid_transaction_total then
    raise exception 'Payment amount exceeds remaining balance for transaction %.', new."transactionPaidId";
  end if;

  return new;
end;
$$;

drop trigger if exists check_payment_balance_before_insert on public."transactionDetails";
create trigger check_payment_balance_before_insert
before insert on public."transactionDetails"
for each row
execute function public.validate_payment_transaction_detail_balance();

drop trigger if exists check_payment_balance_before_update on public."transactionDetails";
create trigger check_payment_balance_before_update
before update on public."transactionDetails"
for each row
execute function public.validate_payment_transaction_detail_balance();

-- Seed defaults for existing accounts
insert into public.payment_methods ("accountId", code, name, "isSystem", is_active)
select a.id, pm.code, pm.name, true, true
from public.accounts a
cross join (
  values
    ('cash', 'Efectivo'),
    ('card', 'Tarjeta de crédito / débito'),
    ('bank_transfer', 'Depósito / transferencia')
) as pm(code, name)
where not exists (
  select 1
  from public.payment_methods x
  where x."accountId" = a.id
    and x.code = pm.code
);

insert into public.concepts (
  "accountId",
  name,
  "parentConceptId",
  "isGroup",
  "isIncome",
  "isExpense",
  "isProduct",
  "isPaymentForm",
  "isAccountPayableConcept",
  "isIncomingPaymentConcept",
  "isOutgoingPaymentConcept",
  "isSystem",
  "taxPercentage",
  price,
  "additionalCharges",
  "createdById"
)
select
  a.id,
  'Pagos entrantes',
  null,
  false,
  true,
  false,
  false,
  false,
  false,
  true,
  false,
  true,
  0,
  0,
  0,
  a."createdById"
from public.accounts a
where not exists (
  select 1
  from public.concepts c
  where c."accountId" = a.id
    and c."isIncomingPaymentConcept" = true
);

insert into public.concepts (
  "accountId",
  name,
  "parentConceptId",
  "isGroup",
  "isIncome",
  "isExpense",
  "isProduct",
  "isPaymentForm",
  "isAccountPayableConcept",
  "isIncomingPaymentConcept",
  "isOutgoingPaymentConcept",
  "isSystem",
  "taxPercentage",
  price,
  "additionalCharges",
  "createdById"
)
select
  a.id,
  'Pagos salientes',
  null,
  false,
  false,
  true,
  false,
  false,
  false,
  false,
  true,
  true,
  0,
  0,
  0,
  a."createdById"
from public.accounts a
where not exists (
  select 1
  from public.concepts c
  where c."accountId" = a.id
    and c."isOutgoingPaymentConcept" = true
);
