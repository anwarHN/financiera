-- Creates account + local currency + admin profile/assignment automatically on signup.
-- Requires `company_name` and optional `country_code` in auth user metadata.

create or replace function public.resolve_currency_by_country(country_code text)
returns table(currency_name text, currency_symbol text)
language plpgsql
stable
as $$
begin
  case upper(coalesce(country_code, 'US'))
    when 'DO' then return query select 'Dominican Peso', 'DOP$';
    when 'MX' then return query select 'Mexican Peso', 'MX$';
    when 'CO' then return query select 'Colombian Peso', 'COP$';
    when 'AR' then return query select 'Argentine Peso', 'AR$';
    when 'CL' then return query select 'Chilean Peso', 'CLP$';
    when 'PE' then return query select 'Peruvian Sol', 'S/';
    when 'BR' then return query select 'Brazilian Real', 'R$';
    when 'ES' then return query select 'Euro', 'EUR€';
    when 'FR' then return query select 'Euro', 'EUR€';
    when 'DE' then return query select 'Euro', 'EUR€';
    when 'IT' then return query select 'Euro', 'EUR€';
    when 'PT' then return query select 'Euro', 'EUR€';
    when 'GB' then return query select 'Pound Sterling', 'GBP£';
    when 'CA' then return query select 'Canadian Dollar', 'CAD$';
    else return query select 'US Dollar', 'USD$';
  end case;
end;
$$;

create or replace function public.handle_new_user_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_account_id bigint;
  admin_profile_id bigint;
  invited_account_id bigint;
  invited_profile_id bigint;
  invitation_id bigint;
  metadata_invitation_id bigint;
  company_name text;
  country_code text;
  local_currency_name text;
  local_currency_symbol text;
  incoming_payment_concept_id bigint;
  outgoing_payment_concept_id bigint;
begin
  company_name := coalesce(nullif(new.raw_user_meta_data ->> 'company_name', ''), 'Empresa');
  country_code := upper(coalesce(new.raw_user_meta_data ->> 'country_code', 'US'));
  if coalesce(new.raw_user_meta_data ->> 'invitation_id', '') ~ '^[0-9]+$' then
    metadata_invitation_id := (new.raw_user_meta_data ->> 'invitation_id')::bigint;
  else
    metadata_invitation_id := null;
  end if;

  if to_regclass('public.account_user_invitations') is not null then
    if metadata_invitation_id is not null then
      select i.id, i."accountId", i."profileId"
      into invitation_id, invited_account_id, invited_profile_id
      from public.account_user_invitations i
      where i.id = metadata_invitation_id
        and lower(i.email) = lower(new.email)
        and i.status in ('pending', 'sent')
      limit 1;
    end if;

    if invited_account_id is null then
      select i.id, i."accountId", i."profileId"
      into invitation_id, invited_account_id, invited_profile_id
      from public.account_user_invitations i
      where lower(i.email) = lower(new.email)
        and i.status in ('pending', 'sent')
      order by i.id desc
      limit 1;
    end if;
  end if;

  if invited_account_id is not null then
    insert into public."usersToAccounts" ("userId", "accountId")
    values (new.id, invited_account_id);

    if invited_profile_id is not null and to_regclass('public.users_to_profiles') is not null then
      insert into public.users_to_profiles ("accountId", "userId", "profileId")
      values (invited_account_id, new.id, invited_profile_id)
      on conflict ("accountId", "userId")
      do update set "profileId" = excluded."profileId";
    end if;

    if invitation_id is not null then
      update public.account_user_invitations
      set status = 'linked'
      where id = invitation_id;
    end if;

    return new;
  end if;

  insert into public.accounts (name, email, "createdById")
  values (company_name, new.email, new.id)
  returning id into new_account_id;

  insert into public."usersToAccounts" ("userId", "accountId")
  values (new.id, new_account_id);

  select currency_name, currency_symbol
  into local_currency_name, local_currency_symbol
  from public.resolve_currency_by_country(country_code);

  insert into public.currencies (name, symbol, "isLocal", "accountId")
  values (local_currency_name, local_currency_symbol, true, new_account_id);

  if to_regclass('public.account_profiles') is not null then
    insert into public.account_profiles (
      "accountId",
      name,
      "isSystemAdmin",
      "canCreateUsers",
      "canCreateProfiles",
      "canVoidTransactions",
      permissions,
      "createdById"
    )
    values (
      new_account_id,
      'Administrador',
      true,
      true,
      true,
      true,
      '{"transactions":{"read":true,"create":true,"update":true},"concepts":{"read":true,"create":true,"update":true},"clients":{"read":true,"create":true,"update":true},"providers":{"read":true,"create":true,"update":true}}'::jsonb,
      new.id
    )
    returning id into admin_profile_id;

    if to_regclass('public.users_to_profiles') is not null then
      insert into public.users_to_profiles ("accountId", "userId", "profileId")
      values (new_account_id, new.id, admin_profile_id);
    end if;
  end if;

  if to_regclass('public.payment_methods') is not null then
    insert into public.payment_methods ("accountId", code, name, "isSystem", is_active)
    values
      (new_account_id, 'cash', 'Efectivo', true, true),
      (new_account_id, 'card', 'Tarjeta de crédito / débito', true, true),
      (new_account_id, 'bank_transfer', 'Depósito / transferencia', true, true)
    on conflict ("accountId", code) do update
      set name = excluded.name,
          "isSystem" = true,
          is_active = true;
  end if;

  if to_regclass('public.concepts') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'concepts'
         and column_name = 'isIncomingPaymentConcept'
     )
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'concepts'
         and column_name = 'isOutgoingPaymentConcept'
     )
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'concepts'
         and column_name = 'isSystem'
     ) then
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
    values (
      new_account_id,
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
      new.id
    )
    on conflict do nothing
    returning id into incoming_payment_concept_id;

    if incoming_payment_concept_id is null then
      select id into incoming_payment_concept_id
      from public.concepts
      where "accountId" = new_account_id
        and "isIncomingPaymentConcept" = true
      limit 1;
    end if;

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
    values (
      new_account_id,
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
      new.id
    )
    on conflict do nothing
    returning id into outgoing_payment_concept_id;

    if outgoing_payment_concept_id is null then
      select id into outgoing_payment_concept_id
      from public.concepts
      where "accountId" = new_account_id
        and "isOutgoingPaymentConcept" = true
      limit 1;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user_account();
