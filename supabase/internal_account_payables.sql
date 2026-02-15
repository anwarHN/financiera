-- Internal obligations in transactions table (no separate table)
-- 1) Add flag in account payment forms to create internal obligation automatically.
-- 2) Add transaction flags to identify internal obligations and internal transfers.
-- 3) Auto-create internal obligation transaction when outgoing payment uses flagged payment form.

alter table public.account_payment_forms
add column if not exists "createInternalPayableOnOutgoingPayment" boolean not null default false;

alter table public.transactions
add column if not exists "isInternalObligation" boolean not null default false;

alter table public.transactions
add column if not exists "sourceTransactionId" bigint references public.transactions(id);

alter table public.transactions
add column if not exists "isInternalTransfer" boolean not null default false;

alter table public.transactions
add column if not exists "isDeposit" boolean not null default false;

create or replace function public.create_internal_obligation_from_outgoing_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_tx record;
  payment_form record;
  payment_amount numeric;
begin
  select
    t.id,
    t."accountId",
    t."personId",
    t.date,
    t.total,
    t."currencyId",
    t."referenceNumber",
    t."accountPaymentFormId",
    t."createdById",
    t."isOutcomingPayment",
    t."isActive"
  into payment_tx
  from public.transactions t
  where t.id = new."transactionId";

  if payment_tx.id is null
     or coalesce(payment_tx."isOutcomingPayment", false) = false
     or coalesce(payment_tx."isActive", true) = false
     or payment_tx."accountPaymentFormId" is null then
    return new;
  end if;

  select
    apf.id,
    apf.name,
    apf."createInternalPayableOnOutgoingPayment"
  into payment_form
  from public.account_payment_forms apf
  where apf.id = payment_tx."accountPaymentFormId";

  if payment_form.id is null
     or coalesce(payment_form."createInternalPayableOnOutgoingPayment", false) = false then
    return new;
  end if;

  if exists (
    select 1
    from public.transactions t
    where t."sourceTransactionId" = payment_tx.id
      and t."isInternalObligation" = true
  ) then
    return new;
  end if;

  payment_amount := abs(coalesce(payment_tx.total, 0));
  if payment_amount <= 0 then
    return new;
  end if;

  insert into public.transactions (
    "accountId",
    "personId",
    date,
    type,
    name,
    "referenceNumber",
    "status",
    "createdById",
    net,
    discounts,
    taxes,
    "additionalCharges",
    total,
    "isAccountPayable",
    "isAccountReceivable",
    "isIncomingPayment",
    "isOutcomingPayment",
    balance,
    payments,
    "isActive",
    "currencyId",
    "paymentMethodId",
    "accountPaymentFormId",
    "isInternalObligation",
    "sourceTransactionId",
    "isInternalTransfer",
    "isDeposit"
  )
  values (
    payment_tx."accountId",
    payment_tx."personId",
    payment_tx.date,
    4, -- purchase
    concat('Obligación interna ', coalesce(payment_form.name, ''), ' #', payment_tx.id),
    payment_tx."referenceNumber",
    1,
    payment_tx."createdById",
    payment_amount,
    0,
    0,
    0,
    payment_amount,
    true,
    false,
    false,
    false,
    payment_amount,
    0,
    true,
    payment_tx."currencyId",
    null,
    payment_tx."accountPaymentFormId",
    true,
    payment_tx.id,
    false,
    false
  );

  return new;
end;
$$;

drop trigger if exists create_internal_obligation_after_payment_detail_insert on public."transactionDetails";
create trigger create_internal_obligation_after_payment_detail_insert
after insert on public."transactionDetails"
for each row
execute function public.create_internal_obligation_from_outgoing_payment();
