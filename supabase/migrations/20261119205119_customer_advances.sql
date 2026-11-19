begin;

alter table public.customer_credit_entries
  drop constraint if exists customer_credit_entries_kind_check;

alter table public.customer_credit_entries
  add constraint customer_credit_entries_kind_check
  check (kind in ('opening', 'excess', 'advance', 'application', 'refund'));

alter table public.customer_credit_entries
  drop constraint if exists customer_credit_entries_check;

alter table public.customer_credit_entries
  add constraint customer_credit_entries_origin_check
  check ((kind in ('opening', 'excess', 'advance') and "creditId" is null)
    or (kind in ('application', 'refund') and "creditId" is not null));

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
  if p_action not in ('opening','receive','advance','application','refund','reverse') then raise exception 'Invalid operation'; end if;
  if p_date is null or p_date > current_date or nullif(trim(p_reference), '') is null or p_request is null then
    raise exception 'Date and reference are required; future dates are not allowed';
  end if;
  if p_action = 'advance' and p_invoice is not null then raise exception 'An advance cannot target an invoice when received'; end if;

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
        and kind in ('opening','excess','advance') and "voidedOn" is null for update;
    if not found or p_date < v_credit.date then raise exception 'Credit not available on this date'; end if;
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
  if p_action in ('receive','advance','refund') then
    if not exists (select 1 from public.payment_methods where id = p_method and "accountId" = p_account and is_active) then
      raise exception 'Invalid payment method';
    end if;
    select kind into v_form_kind from public.account_payment_forms where id = p_form and "accountId" = p_account and "isActive";
    if not found then raise exception 'Select an active payment account'; end if;
    select id into v_concept from public.concepts where "accountId" = p_account
      and case when p_action in ('receive','advance') then "isIncomingPaymentConcept" else "isOutgoingPaymentConcept" end order by id limit 1;
    if v_concept is null then raise exception 'Missing system payment concept'; end if;
    insert into public.transactions ("accountId", "personId", "currencyId", date, type, name, status,
      "createdById", net, discounts, taxes, "additionalCharges", total, balance, payments,
      "isAccountReceivable", "isAccountPayable", "isIncomingPayment", "isOutcomingPayment", "isActive",
      "paymentMethodId", "accountPaymentFormId", "referenceNumber", "isReconciled", "reconciledAt", "creditRequestId")
    values (p_account, p_person, p_currency, p_date, case when p_action in ('receive','advance') then 6 else 5 end,
      p_reference, 1, auth.uid(), p_amount, 0, 0, 0, p_amount, 0, p_amount,
      false, false, p_action in ('receive','advance'), p_action = 'refund', true, p_method, p_form, p_reference,
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
  return jsonb_build_object('id',coalesce(v_tx,v_id),'applied',v_applied,
    'credit',case when p_action in ('receive','advance') then p_amount-v_applied else 0 end);
end;
$$;

drop function if exists public.create_numbered_invoice(jsonb,jsonb);

create function public.create_numbered_invoice(
  p_transaction jsonb,
  p_details jsonb,
  p_credit bigint default null,
  p_credit_amount numeric default null,
  p_credit_request uuid default null
) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare tx jsonb; detail jsonb; cols text; v_id bigint; v_account bigint;
begin
  v_account := (p_transaction->>'accountId')::bigint;
  if not public.user_belongs_to_account(v_account) then raise exception 'Sin acceso a esta cuenta.'; end if;
  if not exists (select 1 from public.users_to_profiles u join public.account_profiles p
    on p.id = u."profileId" and p."accountId" = u."accountId"
    where u."accountId" = v_account and u."userId" = auth.uid()
      and (p."isSystemAdmin" or coalesce((p.permissions->'sales'->>'create')::boolean,false))) then
    raise exception 'Sin permiso para crear facturas.';
  end if;
  if (p_transaction->>'type')::int is distinct from 1 then raise exception 'Solo se permiten facturas.'; end if;
  if jsonb_typeof(p_details) is distinct from 'array' or jsonb_array_length(p_details) = 0 then raise exception 'La factura requiere detalle.'; end if;
  if (p_credit is null) is distinct from (p_credit_amount is null) then raise exception 'Selecciona el anticipo y el monto a aplicar.'; end if;
  if p_credit is not null and (p_credit_amount <= 0 or p_credit_request is null) then raise exception 'La aplicacion del anticipo es invalida.'; end if;
  tx := (p_transaction - array['id','created_at','number','printNumber','correlativeId','correlativeSnapshot'])
    || jsonb_build_object('createdById', auth.uid());
  select string_agg(format('%I', a.attname), ',') into cols from pg_catalog.pg_attribute a
    where a.attrelid = 'public.transactions'::regclass and a.attnum > 0 and not a.attisdropped
      and tx ? a.attname;
  execute format('insert into public.transactions (%s) select %s from jsonb_populate_record(null::public.transactions,$1) returning id',cols,cols)
    using tx into v_id;
  for detail in select value from jsonb_array_elements(p_details) loop
    detail := (detail - array['id','created_at','transactionId']) || jsonb_build_object('transactionId',v_id,'createdById',auth.uid());
    select string_agg(format('%I', a.attname), ',') into cols from pg_catalog.pg_attribute a
      where a.attrelid = 'public."transactionDetails"'::regclass and a.attnum > 0 and not a.attisdropped and detail ? a.attname;
    execute format('insert into public."transactionDetails" (%s) select %s from jsonb_populate_record(null::public."transactionDetails",$1)',cols,cols) using detail;
  end loop;
  if p_credit is not null then
    perform private.customer_credit_command(
      v_account,
      'application',
      (tx->>'personId')::bigint,
      (tx->>'currencyId')::bigint,
      p_credit_amount,
      (tx->>'date')::date,
      coalesce(nullif(tx->>'referenceNumber',''), 'Anticipo aplicado a factura #' || v_id),
      p_credit,
      v_id,
      null,
      null,
      p_credit_request
    );
  end if;
  return v_id;
end;
$$;

revoke all on function public.create_numbered_invoice(jsonb,jsonb,bigint,numeric,uuid) from public, anon;
grant execute on function public.create_numbered_invoice(jsonb,jsonb,bigint,numeric,uuid) to authenticated;

commit;
