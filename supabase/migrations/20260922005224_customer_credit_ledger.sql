create schema if not exists private;
grant usage on schema private to authenticated;

create table public.customer_credit_entries (
  id bigint generated always as identity primary key,
  "accountId" bigint not null references public.accounts(id),
  "personId" bigint not null references public.persons(id),
  "currencyId" bigint not null references public.currencies(id),
  kind text not null check (kind in ('opening', 'excess', 'application', 'refund')),
  amount numeric(18,2) not null check (amount > 0),
  date date not null,
  reference text not null,
  "creditId" bigint references public.customer_credit_entries(id),
  "transactionId" bigint references public.transactions(id),
  "invoiceId" bigint references public.transactions(id),
  "requestId" uuid not null unique,
  "createdById" uuid not null default auth.uid() references auth.users(id),
  "createdAt" timestamptz not null default now(),
  "voidedOn" date,
  "voidedById" uuid references auth.users(id),
  "voidReference" text,
  "voidRequestId" uuid unique,
  check ((kind in ('opening', 'excess') and "creditId" is null)
    or (kind in ('application', 'refund') and "creditId" is not null))
);
create index on public.customer_credit_entries ("accountId", "personId", "currencyId", date);
create index on public.customer_credit_entries ("creditId");
create index on public.customer_credit_entries ("invoiceId");
create index on public.customer_credit_entries ("transactionId");
alter table public.customer_credit_entries enable row level security;
revoke all on public.customer_credit_entries from anon, authenticated;
grant select on public.customer_credit_entries to authenticated;
create policy credit_read on public.customer_credit_entries for select to authenticated
using (public.user_belongs_to_account("accountId") and exists (
  select 1 from public.users_to_profiles up
  join public.account_profiles ap on ap.id = up."profileId" and ap."accountId" = up."accountId"
  where up."userId" = auth.uid() and up."accountId" = customer_credit_entries."accountId"
    and (ap."isSystemAdmin" or coalesce((ap.permissions->'transactions'->>'read')::boolean, false)
      or (coalesce((ap.permissions->'reports'->>'read')::boolean, false)
        and coalesce((ap.permissions->'reportAccess'->>'receivable')::boolean, true)))
));

alter table public.transactions add column "creditRequestId" uuid unique;

create or replace function private.customer_invoice_paid(p_id bigint)
returns numeric language sql stable set search_path = '' as $$
  select
    coalesce((select sum(abs(d.total)) from public."transactionDetails" d
      join public.transactions t on t.id = d."transactionId"
      where d."transactionPaidId" = p_id and t."isActive"), 0)
    + coalesce((select sum(e.amount) from public.customer_credit_entries e
      where e.kind = 'application' and e."invoiceId" = p_id and e."voidedOn" is null), 0);
$$;

create or replace function private.refresh_customer_invoice(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.transactions
    set payments = private.customer_invoice_paid(p_id),
        balance = greatest(abs(total) - private.customer_invoice_paid(p_id), 0)
    where id = p_id;
end;
$$;
revoke all on function private.refresh_customer_invoice(bigint) from public;

create or replace function private.customer_credit_command(
  p_account bigint, p_action text, p_person bigint, p_currency bigint,
  p_amount numeric, p_date date, p_reference text, p_credit bigint,
  p_invoice bigint, p_method bigint, p_form bigint, p_request uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.account_profiles%rowtype;
  v_credit public.customer_credit_entries%rowtype;
  v_invoice public.transactions%rowtype;
  v_id bigint; v_tx bigint; v_concept bigint; v_available numeric; v_applied numeric := 0;
  v_entry public.customer_credit_entries%rowtype;
  v_form_kind text;
begin
  if auth.uid() is null or not coalesce(public.user_belongs_to_account(p_account),false) then raise exception 'Access denied'; end if;
  select ap.* into v_profile from public.users_to_profiles up
    join public.account_profiles ap on ap.id = up."profileId" and ap."accountId" = up."accountId"
    where up."accountId" = p_account and up."userId" = auth.uid();
  if not found or not (coalesce(v_profile."isSystemAdmin",false) or
    case when p_action = 'reverse' then coalesce(v_profile."canVoidTransactions", false)
    else coalesce((v_profile.permissions->'transactions'->>'create')::boolean, false) end) then
    raise exception 'Permission denied';
  end if;
  if p_action not in ('opening','receive','application','refund','reverse') then raise exception 'Invalid operation'; end if;
  if p_date is null or p_date > current_date or nullif(trim(p_reference), '') is null or p_request is null then
    raise exception 'Date and reference are required; future dates are not allowed';
  end if;
  -- Serialize credit consumption per account, then lock the destination invoice.
  perform 1 from public.accounts where id = p_account for update;
  select case when "voidRequestId" = p_request then id else coalesce("transactionId",id) end
    into v_id from public.customer_credit_entries
    where ("requestId" = p_request or "voidRequestId" = p_request) and "accountId" = p_account;
  if found then return jsonb_build_object('id', v_id); end if;
  select id into v_tx from public.transactions where "creditRequestId" = p_request and "accountId" = p_account;
  if found then return jsonb_build_object('id', v_tx); end if;

  if p_action = 'reverse' then
    select * into v_entry from public.customer_credit_entries where id = p_credit and "accountId" = p_account for update;
    if not found or v_entry."voidedOn" is not null then raise exception 'Entry not available'; end if;
    if p_date < v_entry.date then raise exception 'Reversal cannot precede the entry'; end if;
    if exists (select 1 from public.customer_credit_entries where "creditId" = v_entry.id and "voidedOn" is null) then
      raise exception 'Reverse applications and refunds before reversing this credit';
    end if;
    if exists (select 1 from public.customer_credit_entries where "creditId" = v_entry.id and "voidedOn" > p_date) then
      raise exception 'Reversal cannot precede the reversal of its applications';
    end if;
    update public.customer_credit_entries set "voidedOn" = p_date, "voidedById" = auth.uid(), "voidReference" = p_reference, "voidRequestId" = p_request where id = v_entry.id;
    if v_entry."transactionId" is not null then
      update public.transactions set "isActive" = false where id = v_entry."transactionId";
      for v_id in select "transactionPaidId" from public."transactionDetails"
        where "transactionId" = v_entry."transactionId" and "transactionPaidId" is not null loop
        perform private.refresh_customer_invoice(v_id);
      end loop;
    end if;
    if v_entry.kind = 'application' then perform private.refresh_customer_invoice(v_entry."invoiceId"); end if;
    return jsonb_build_object('id', v_entry.id);
  end if;

  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <= 0 or p_amount <> round(p_amount,2) then raise exception 'Invalid amount'; end if;
  if not exists (select 1 from public.persons where id = p_person and "accountId" = p_account and type = 1) then
    raise exception 'Customer not found in this account';
  end if;
  if not exists (select 1 from public.currencies where id = p_currency and ("accountId" = p_account or "accountId" is null)) then
    raise exception 'Invalid currency';
  end if;
  if p_action in ('application','refund') then
    select * into v_credit from public.customer_credit_entries
      where id = p_credit and "accountId" = p_account and "personId" = p_person and "currencyId" = p_currency
        and kind in ('opening','excess') and "voidedOn" is null for update;
    if not found or p_date < v_credit.date then raise exception 'Credit not available on this date'; end if;
    -- Do not allow backdated consumption that could invalidate an intermediate balance.
    if exists (select 1 from public.customer_credit_entries where "creditId" = p_credit
      and (date > p_date or "voidedOn" > p_date)) then raise exception 'Use a date on or after the latest credit movement'; end if;
    select v_credit.amount - coalesce(sum(amount), 0) into v_available
      from public.customer_credit_entries where "creditId" = p_credit and "voidedOn" is null;
    if p_amount > v_available then raise exception 'Amount exceeds available credit'; end if;
  end if;
  if p_action in ('application','receive') and p_invoice is not null then
    select * into v_invoice from public.transactions
      where id = p_invoice and "accountId" = p_account and "personId" = p_person
      and "currencyId" = p_currency and "isActive" and "isAccountReceivable"
      and not coalesce("isEmployeeLoan", false) for update;
    if not found or p_date < v_invoice.date then raise exception 'Invalid receivable or date'; end if;
    v_available := greatest(abs(v_invoice.total) - private.customer_invoice_paid(p_invoice), 0);
    v_applied := least(p_amount, v_available);
    if p_action = 'application' and p_amount > v_available then raise exception 'Amount exceeds invoice balance'; end if;
  elsif p_action = 'application' then raise exception 'Select a receivable';
  end if;
  if p_action in ('receive','refund') then
    if not exists (select 1 from public.payment_methods where id = p_method and "accountId" = p_account and is_active) then
      raise exception 'Invalid payment method';
    end if;
    select kind into v_form_kind from public.account_payment_forms where id = p_form and "accountId" = p_account and "isActive";
    if not found then raise exception 'Select an active payment account'; end if;
    select id into v_concept from public.concepts where "accountId" = p_account
      and case when p_action = 'receive' then "isIncomingPaymentConcept" else "isOutgoingPaymentConcept" end order by id limit 1;
    if v_concept is null then raise exception 'Missing system payment concept'; end if;
    insert into public.transactions ("accountId", "personId", "currencyId", date, type, name, status,
      "createdById", net, discounts, taxes, "additionalCharges", total, balance, payments,
      "isAccountReceivable", "isAccountPayable", "isIncomingPayment", "isOutcomingPayment", "isActive",
      "paymentMethodId", "accountPaymentFormId", "referenceNumber", "isReconciled", "reconciledAt", "creditRequestId")
    values (p_account, p_person, p_currency, p_date, case when p_action = 'receive' then 6 else 5 end,
      p_reference, 1, auth.uid(), p_amount, 0, 0, 0, p_amount, 0, p_amount,
      false, false, p_action = 'receive', p_action = 'refund', true, p_method, p_form, p_reference,
      v_form_kind = 'bank_account', case when v_form_kind = 'bank_account' then p_date end, p_request)
    returning id into v_tx;
    if v_applied > 0 then
      insert into public."transactionDetails" ("transactionId","transactionPaidId","conceptId",quantity,price,net,total,tax,"taxPercentage",discount,"discountPercentage","additionalCharges","createdById")
      values (v_tx,p_invoice,v_concept,1,v_applied,v_applied,v_applied,0,0,0,0,0,auth.uid());
    end if;
    if p_amount > v_applied then
      insert into public."transactionDetails" ("transactionId","conceptId",quantity,price,net,total,tax,"taxPercentage",discount,"discountPercentage","additionalCharges","createdById")
      values (v_tx,v_concept,1,p_amount-v_applied,p_amount-v_applied,p_amount-v_applied,0,0,0,0,0,auth.uid());
    end if;
  end if;
  if p_action <> 'receive' or p_amount > v_applied then
    insert into public.customer_credit_entries ("accountId","personId","currencyId",kind,amount,date,reference,"creditId","transactionId","invoiceId","requestId")
    values (p_account,p_person,p_currency,case when p_action='receive' then 'excess' else p_action end,
      p_amount-v_applied * case when p_action='receive' then 1 else 0 end,p_date,p_reference,
      case when p_action in ('application','refund') then p_credit end,v_tx,
      case when p_action='application' then p_invoice end,p_request) returning id into v_id;
  end if;
  if p_invoice is not null and p_action in ('receive','application') then perform private.refresh_customer_invoice(p_invoice); end if;
  return jsonb_build_object('id',coalesce(v_tx,v_id),'applied',v_applied,'credit',case when p_action='receive' then p_amount-v_applied else 0 end);
end;
$$;
revoke all on function private.customer_credit_command(bigint,text,bigint,bigint,numeric,date,text,bigint,bigint,bigint,bigint,uuid) from public;
grant execute on function private.customer_credit_command(bigint,text,bigint,bigint,numeric,date,text,bigint,bigint,bigint,bigint,uuid) to authenticated;
create or replace function public.customer_credit_command(
  p_account bigint, p_action text, p_person bigint, p_currency bigint,
  p_amount numeric, p_date date, p_reference text, p_credit bigint,
  p_invoice bigint, p_method bigint, p_form bigint, p_request uuid
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.customer_credit_command(p_account,p_action,p_person,p_currency,p_amount,p_date,p_reference,p_credit,p_invoice,p_method,p_form,p_request);
$$;
revoke all on function public.customer_credit_command(bigint,text,bigint,bigint,numeric,date,text,bigint,bigint,bigint,bigint,uuid) from public;
grant execute on function public.customer_credit_command(bigint,text,bigint,bigint,numeric,date,text,bigint,bigint,bigint,bigint,uuid) to authenticated;

-- Protect cash origins and destination invoices from edits which would orphan credit.
create or replace function private.guard_customer_credit_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.customer_credit_entries where "transactionId" = old.id) then
    if tg_op = 'DELETE' then raise exception 'Credit-related transactions cannot be deleted'; end if;
    if (to_jsonb(new) - array['payments','balance','isActive','name','isReconciled','reconciledAt'])
      is distinct from (to_jsonb(old) - array['payments','balance','isActive','name','isReconciled','reconciledAt']) then
      raise exception 'Credit-related cash movements cannot be modified';
    end if;
    if new."isActive" is distinct from old."isActive" and exists (
      select 1 from public.customer_credit_entries where "transactionId" = old.id and "voidedOn" is null
    ) then raise exception 'Reverse this movement from customer credits'; end if;
    if new."isActive" and not old."isActive" then raise exception 'Credit cash movements cannot be reactivated'; end if;
  end if;
  if exists (select 1 from public.customer_credit_entries where "invoiceId" = old.id and "voidedOn" is null) then
    if tg_op = 'DELETE' then raise exception 'Reverse credit applications before deleting the invoice'; end if;
    if not new."isActive" or new."personId" is distinct from old."personId"
      or new."currencyId" is distinct from old."currencyId" or new."accountId" <> old."accountId"
      or new.date is distinct from old.date or not new."isAccountReceivable" then
      raise exception 'Reverse credit applications before changing the invoice';
    end if;
    new.payments := private.customer_invoice_paid(old.id);
    if abs(new.total) < new.payments then raise exception 'Total is below applied payments and credit'; end if;
    new.balance := greatest(abs(new.total) - new.payments,0);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_customer_credit_transaction before update or delete on public.transactions
for each row execute function private.guard_customer_credit_transaction();

create or replace function private.guard_customer_credit_detail()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.customer_credit_entries
    where "transactionId" = case when tg_op = 'INSERT' then new."transactionId" else old."transactionId" end)
    or (tg_op = 'UPDATE' and exists (select 1 from public.customer_credit_entries where "transactionId" = new."transactionId")) then
    raise exception 'Credit-related payment details cannot be modified';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_customer_credit_detail before insert or update or delete on public."transactionDetails"
for each row execute function private.guard_customer_credit_detail();

-- Existing payment paths must also count credit applications and lock the invoice.
create or replace function public.validate_payment_transaction_detail_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_total numeric; v_paid numeric; v_active boolean;
begin
  if new."transactionPaidId" is null then return new; end if;
  select abs(total), "isActive" into v_total,v_active from public.transactions where id = new."transactionPaidId" for update;
  if not found or not v_active then raise exception 'Referenced invoice is missing or voided'; end if;
  select coalesce(sum(abs(d.total)),0) into v_paid from public."transactionDetails" d
    join public.transactions t on t.id=d."transactionId"
    where d."transactionPaidId"=new."transactionPaidId" and t."isActive" and (tg_op='INSERT' or d.id<>new.id);
  v_paid := v_paid + coalesce((select sum(amount) from public.customer_credit_entries
    where kind='application' and "invoiceId"=new."transactionPaidId" and "voidedOn" is null),0);
  if round(v_paid+abs(coalesce(new.total,0)),2)>round(v_total,2) then raise exception 'Payment exceeds invoice balance'; end if;
  return new;
end;
$$;
