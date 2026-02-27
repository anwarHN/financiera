-- Cash withdrawals between bank account and cashbox

alter table if exists public.transactions
  add column if not exists "isCashWithdrawal" boolean not null default false;

alter table if exists public.concepts
  add column if not exists "isCashWithdrawalConcept" boolean not null default false;

-- Create system concept for existing accounts when missing.
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
  "isCashWithdrawalConcept",
  "isSystem",
  "taxPercentage",
  price,
  "additionalCharges",
  "createdById"
)
select
  a.id,
  'Retiro de efectivo',
  null,
  false,
  true,
  true,
  false,
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
    and (c."isCashWithdrawalConcept" = true or lower(c.name) = lower('Retiro de efectivo'))
);

update public.concepts
set "isCashWithdrawalConcept" = true,
    "isSystem" = true
where lower(name) = lower('Retiro de efectivo');
