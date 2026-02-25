-- Employee loans over transactions table (no separate table).
-- Adds flags and system concepts for loan disbursement/payment.

alter table public.transactions
add column if not exists "isEmployeeLoan" boolean not null default false;

alter table public.concepts
add column if not exists "isLoanConcept" boolean not null default false;

alter table public.concepts
add column if not exists "isLoanPaymentConcept" boolean not null default false;

-- Backfill system concepts for existing accounts.
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
  "isLoanConcept",
  "isLoanPaymentConcept",
  "isSystem",
  "taxPercentage",
  price,
  "additionalCharges",
  "createdById"
)
select
  a.id,
  'Préstamo',
  null,
  false,
  false,
  true,
  false,
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
  select 1 from public.concepts c where c."accountId" = a.id and c."isLoanConcept" = true
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
  "isLoanConcept",
  "isLoanPaymentConcept",
  "isSystem",
  "taxPercentage",
  price,
  "additionalCharges",
  "createdById"
)
select
  a.id,
  'Pagos a préstamos',
  null,
  false,
  true,
  false,
  false,
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
  select 1 from public.concepts c where c."accountId" = a.id and c."isLoanPaymentConcept" = true
);
