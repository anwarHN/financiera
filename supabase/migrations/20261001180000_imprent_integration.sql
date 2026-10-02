begin;

-- Credentials are server-only, including for account owners. The Edge Function
-- returns an explicit public projection, never credentials or raw provider JSON.
create table public.account_integrations (
  "accountId" bigint not null references public.accounts(id) on delete cascade,
  provider text not null,
  "isActive" boolean not null default false,
  credentials jsonb not null default '{}',
  settings jsonb not null default '{}',
  "lastError" text,
  "updatedAt" timestamptz not null default now(),
  "leaseId" uuid,
  "leaseUntil" timestamptz,
  primary key ("accountId", provider)
);
create unique index account_integrations_imprent_account_unique
  on public.account_integrations ((credentials->>'accountId'))
  where provider = 'imprent' and credentials->>'accountId' is not null;
create unique index account_integrations_imprent_email_unique
  on public.account_integrations ((settings->>'email'))
  where provider = 'imprent' and settings->>'email' is not null;
alter table public.account_integrations enable row level security;
revoke all on public.account_integrations from public, anon, authenticated;
grant all on public.account_integrations to service_role;

create table public.invoice_pdf_templates (
  id bigint generated always as identity primary key,
  "accountId" bigint not null references public.accounts(id) on delete cascade,
  name text not null,
  "providerTemplateId" text not null,
  "fileName" text,
  "isActive" boolean not null default true,
  "isDefault" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  unique ("accountId", "providerTemplateId")
);
create unique index invoice_pdf_one_default on public.invoice_pdf_templates ("accountId")
  where "isActive" and "isDefault";
alter table public.invoice_pdf_templates enable row level security;
revoke all on public.invoice_pdf_templates from public, anon, authenticated;
grant all on public.invoice_pdf_templates to service_role;
grant usage, select on sequence public.invoice_pdf_templates_id_seq to service_role;

create function public.claim_imprent_setup(p_account_id bigint, p_lease uuid) returns boolean
language plpgsql set search_path = '' as $$
begin
  insert into public.account_integrations ("accountId", provider) values (p_account_id, 'imprent') on conflict do nothing;
  update public.account_integrations set "leaseId" = p_lease, "leaseUntil" = now() + interval '5 minutes'
    where "accountId" = p_account_id and provider = 'imprent'
      and ("leaseUntil" is null or "leaseUntil" < now());
  return found;
end;
$$;
revoke all on function public.claim_imprent_setup(bigint, uuid) from public, anon, authenticated;
grant execute on function public.claim_imprent_setup(bigint, uuid) to service_role;

-- Serialize default promotion and insertion in one transaction.
create function public.save_invoice_pdf_template(p_account_id bigint, p_name text,
  p_provider_id text, p_file_name text, p_default boolean default false) returns bigint
language plpgsql set search_path = '' as $$
declare v_id bigint;
begin
  perform 1 from public.accounts where id = p_account_id for update;
  if p_default or not exists (select 1 from public.invoice_pdf_templates where "accountId" = p_account_id and "isActive" and "isDefault") then
    p_default := true;
    update public.invoice_pdf_templates set "isDefault" = false where "accountId" = p_account_id and "isDefault";
  end if;
  insert into public.invoice_pdf_templates ("accountId", name, "providerTemplateId", "fileName", "isDefault")
    values (p_account_id, p_name, p_provider_id, p_file_name, p_default)
    on conflict ("accountId", "providerTemplateId") do update
      set "isActive" = true, "isDefault" = public.invoice_pdf_templates."isDefault" or excluded."isDefault"
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.save_invoice_pdf_template(bigint, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.save_invoice_pdf_template(bigint, text, text, text, boolean) to service_role;
commit;
